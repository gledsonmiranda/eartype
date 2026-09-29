/**
 * Re-times hand-written captions against the ASR track's word timings.
 *
 * Manual captions carry the right *text* — punctuated, proofread — but their
 * timings are typed by hand, and they wander: on ohqxP8EEumo, 154 of 350 cues
 * start more than 0.4s off the audio, some early and some late, up to ~2s.
 * Reading along on YouTube forgives that; dictation does not, because the
 * cue edges are where the audio gets cut — a cue that ends early swallows
 * the last words, and the next one plays them while asking for something else.
 *
 * The ASR track is timed by the recogniser itself, word by word. So each
 * manual cue is aligned, by its words, against the ASR words around it, and
 * takes its start and end from the words it matched. A cue that does not
 * match well enough keeps its own timing — a wrong re-time is worse than a
 * loose one.
 *
 * No network, no DOM: raw VTT and `Cue[]` in, `Cue[]` out.
 */

import { isTypo } from '@/lib/correction/diff';
import { canonicalize, tokensMatch, type Token } from '@/lib/correction/normalize';
import type { Cue } from '@/types';

export type TimedWord = {
  text: string;
  startMs: number;
  endMs: number;
};

// ------------------------------------------------------- ASR word timings

const TIMING_LINE = /^(\S+)\s+-->\s+(\S+)/;
const INLINE_TIMESTAMP = /<(\d{1,3}:\d{2}:\d{2}[.,]\d{1,3})>/;
const TAG = /<\/?[a-zA-Z][^>]*>/g;

/**
 * YouTube redraws every line as a 10ms "ghost" cue before scrolling it up;
 * anything this short carries no new words.
 */
const GHOST_CUE_MS = 50;

/**
 * The last word of a line "lasts" until the next line appears, which often
 * includes a pause. Past this it is silence, not the word.
 */
const MAX_WORD_MS = 1000;

function toMs(raw: string): number {
  const match = /^(?:(\d+):)?(\d{1,3}):(\d{1,2})[.,](\d{1,3})$/.exec(raw.trim());
  if (!match) return NaN;
  const [, hours, minutes, seconds, millis] = match;
  return (
    Number(hours ?? 0) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1000 +
    Number(millis.padEnd(3, '0'))
  );
}

/**
 * Every spoken word of an ASR track with its own start and end.
 *
 * In YouTube's rolling format each real cue holds two lines: the previous one
 * (repeated, so it stays on screen while scrolling) and the new one, whose
 * words carry `<00:00:01.000>` marks — each mark is when the word after it
 * starts; the first word starts with the cue. Only that last line is new.
 * Returns `[]` for a track without word timings (a manual one).
 */
export function parseTimedWords(raw: string): TimedWord[] {
  const lines = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const words: TimedWord[] = [];
  let sawInlineTiming = false;

  for (let i = 0; i < lines.length; i++) {
    const timing = TIMING_LINE.exec(lines[i]);
    if (!timing) continue;

    const cueStart = toMs(timing[1]);
    const cueEnd = toMs(timing[2]);

    const body: string[] = [];
    while (i + 1 < lines.length && lines[i + 1] !== '') body.push(lines[++i]);

    if (!(cueEnd - cueStart > GHOST_CUE_MS)) continue;
    const line = body.filter((current) => current.trim() !== '').at(-1);
    if (line === undefined) continue;

    // Split on the marks: [word, mark, word, mark, word…]
    const parts = line.split(INLINE_TIMESTAMP);
    if (parts.length > 1) sawInlineTiming = true;

    const lineWords: { text: string; startMs: number }[] = [];
    for (let p = 0; p < parts.length; p += 2) {
      const startMs = p === 0 ? cueStart : toMs(parts[p - 1]);
      for (const text of parts[p].replace(TAG, ' ').trim().split(/\s+/).filter(Boolean)) {
        lineWords.push({ text, startMs });
      }
    }

    lineWords.forEach((word, index) => {
      const next = lineWords[index + 1]?.startMs ?? cueEnd;
      words.push({ ...word, endMs: Math.min(next, word.startMs + MAX_WORD_MS) });
    });
  }

  return sawInlineTiming ? words : [];
}

// ----------------------------------------------------------------- aligning

/** How far from its own timing a cue's words are looked for. Drift seen: ~2s. */
const SEARCH_WINDOW_MS = 4000;

/**
 * A cue of one or two words can match a common word anywhere in the window
 * (`So`, `the`), so it may only move a little.
 */
const SHORT_CUE_TOKENS = 3;
const SHORT_CUE_MAX_SHIFT_MS = 1500;

/** At least this share of a cue's words must be found for its timing to change. */
const MIN_MATCHED_SHARE = 0.5;

const COST_MATCH = 0;
const COST_TYPO = 0.5;
const COST_MISMATCH = 1;
const COST_GAP = 1;

/** Sound annotations — `[music]`, `[applause]` — are not words to align on. */
const ANNOTATION = /^\[.*\]$/;

type AsrToken = { token: Token; word: TimedWord };

function asrTokens(words: TimedWord[]): AsrToken[] {
  return words
    .filter((word) => !ANNOTATION.test(word.text))
    .flatMap((word) => canonicalize(word.text).map((token) => ({ token, word })));
}

function pairCost(reference: Token, heard: Token): number {
  if (tokensMatch(reference, heard)) return COST_MATCH;
  if (isTypo(reference, heard)) return COST_TYPO;
  return COST_MISMATCH;
}

type Pair = { cueToken: number; asr: number };

/**
 * Semi-global alignment: every token of the cue must be placed (matched or
 * missing), but the ASR tokens before and after it in the window are free.
 * Among equally good placements, the one that starts nearest the cue's own
 * start wins — the text repeats, the timing tie-breaks.
 */
function alignCue(tokens: Token[], window: AsrToken[], cueStartMs: number): Pair[] {
  const k = tokens.length;
  const w = window.length;
  const cost: number[][] = Array.from({ length: k + 1 }, (_, i) =>
    new Array<number>(w + 1).fill(i === 0 ? 0 : Infinity),
  );
  for (let i = 1; i <= k; i++) cost[i][0] = i * COST_GAP;

  for (let i = 1; i <= k; i++) {
    for (let j = 1; j <= w; j++) {
      cost[i][j] = Math.min(
        cost[i - 1][j - 1] + pairCost(tokens[i - 1], window[j - 1].token),
        cost[i - 1][j] + COST_GAP,
        cost[i][j - 1] + COST_GAP,
      );
    }
  }

  const backtrack = (end: number): Pair[] => {
    const pairs: Pair[] = [];
    let i = k;
    let j = end;
    while (i > 0 && j > 0) {
      const aligned = cost[i - 1][j - 1] + pairCost(tokens[i - 1], window[j - 1].token);
      if (cost[i][j] === aligned) {
        if (aligned - cost[i - 1][j - 1] < COST_MISMATCH) pairs.push({ cueToken: i - 1, asr: j - 1 });
        i--;
        j--;
      } else if (cost[i][j] === cost[i - 1][j] + COST_GAP) {
        i--;
      } else {
        j--;
      }
    }
    return pairs.reverse();
  };

  const best = Math.min(...cost[k]);
  let chosen: Pair[] = [];
  let chosenDistance = Infinity;
  for (let end = 0; end <= w; end++) {
    if (cost[k][end] !== best) continue;
    const pairs = backtrack(end);
    if (pairs.length === 0) continue;
    const distance = Math.abs(window[pairs[0].asr].word.startMs - cueStartMs);
    if (distance < chosenDistance) {
      chosen = pairs;
      chosenDistance = distance;
    }
  }

  return chosen;
}

/**
 * Moves each cue onto the ASR words it matches. Cues keep their text, order
 * and ids; only `startMs`/`endMs` change, and only for cues that matched well.
 */
export function retimeCues(cues: Cue[], words: TimedWord[]): Cue[] {
  const heard = asrTokens(words);
  if (heard.length === 0) return cues;

  let previousStart = -Infinity;

  return cues.map((cue) => {
    const tokens = canonicalize(cue.text);
    const window = heard.filter(
      ({ word }) =>
        word.startMs >= cue.startMs - SEARCH_WINDOW_MS && word.startMs <= cue.endMs + SEARCH_WINDOW_MS,
    );
    if (tokens.length === 0 || window.length === 0) return cue;

    const pairs = alignCue(tokens, window, cue.startMs);
    if (pairs.length < Math.max(1, Math.ceil(tokens.length * MIN_MATCHED_SHARE))) return cue;

    const first = pairs[0];
    const last = pairs[pairs.length - 1];
    const heardStart = window[first.asr].word.startMs;
    const heardEnd = window[last.asr].word.endMs;

    if (
      tokens.length < SHORT_CUE_TOKENS &&
      Math.abs(heardStart - cue.startMs) > SHORT_CUE_MAX_SHIFT_MS
    ) {
      return cue;
    }

    // Words at the edges that were not found were still said: never cut
    // into them, keep the original edge where it is wider.
    let startMs = first.cueToken === 0 ? heardStart : Math.min(cue.startMs, heardStart);
    const endMs =
      last.cueToken === tokens.length - 1 ? heardEnd : Math.max(cue.endMs, heardEnd);

    startMs = Math.max(startMs, previousStart);
    previousStart = startMs;

    return { ...cue, startMs, endMs: Math.max(endMs, startMs) };
  });
}
