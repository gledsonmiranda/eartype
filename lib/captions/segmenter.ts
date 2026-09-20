/**
 * RF-03 — turns irregular cues into practiceable segments.
 *
 * Raw captions arrive in arbitrary chunks (sometimes a stray word, sometimes a
 * whole sentence). The segmenter regroups them into 3–8s pieces of up to ~15
 * words, preferring to break where the speech actually pauses.
 *
 * No React, no DOM, no network: `Cue[]` in, `Segment[]` out.
 */

import type { Cue, Segment } from '@/types';

export type SegmentOptions = {
  /** Below this a segment is too short to practise. */
  minMs?: number;
  /** Target floor: only past this is it worth looking for a break. */
  targetMinMs?: number;
  /** Hard duration cap. */
  maxMs?: number;
  /** Hard word cap. */
  maxWords?: number;
  /** Silence between cues that counts as a natural pause. */
  silenceGapMs?: number;
  /** Strip `[Music]`, `>>`, `NAME:` and friends. */
  stripNonSpeech?: boolean;
};

const DEFAULTS: Required<SegmentOptions> = {
  minMs: 1500,
  targetMinMs: 3000,
  maxMs: 8000,
  maxWords: 15,
  silenceGapMs: 700,
  stripNonSpeech: true,
};

// ---------------------------------------------------------------- cleanup

/** `[Music]`, `[Applause]`, `[Laughter]`, `[ __ ]`… — YouTube's convention. */
const BRACKETS = /\[[^\]]*\]/g;
/** A whole cue in parentheses is a sound annotation: `(baaaah!!)`. */
const ONLY_PARENTHESES = /^\([^)]*\)$/;
/**
 * Speaker-change marker, with the label that may follow it. Anywhere in the
 * cue, not only at the start: a speaker change lands mid-cue often enough
 * (`gotten into her car. >> [music]`), and a lone `>>` left behind becomes a
 * segment of its own.
 */
const CHEVRONS = />>+\s*(?:[A-Z][A-Z0-9 .'’-]{1,24}:\s*)?/g;
/** Upper-case speaker label: `JOHN:`, `NARRATOR:`, `DR. SMITH:`. */
const SPEAKER_LABEL = /^[A-Z][A-Z0-9 .'’-]{1,24}:\s*/;
/** Music lines: ♪ … ♪ */
const MUSIC_NOTES = /[♪♫]/g;

export function stripNonSpeech(text: string): string {
  let result = text.replace(BRACKETS, ' ');
  result = result.replace(MUSIC_NOTES, ' ');
  result = result.replace(CHEVRONS, ' ');
  result = result.trim().replace(SPEAKER_LABEL, '');
  result = result.trim();
  if (ONLY_PARENTHESES.test(result)) return '';
  return result.replace(/\s+/g, ' ').trim();
}

/** Comparable form of a word — only to spot repetition, never for the diff. */
function key(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
}

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

export function countWords(text: string): number {
  return words(text).length;
}

/**
 * Removes the *rolling text* of auto-generated captions: YouTube repeats the
 * previous line at the start of the next cue.
 *
 * A partial overlap needs at least 3 words to count, because a short repeat is
 * real speech — "have really… really really long trunks" must survive intact.
 * When the repeat covers the *whole* previous cue and the two cues are glued
 * together in time, length stops mattering: that is the rolling text's own
 * signature, and it is how a one-word cue ("things.") gets repeated.
 */
const MIN_OVERLAP = 3;
/** Cues this close together are the same sentence being redrawn on screen. */
const CONTIGUOUS_MS = 50;

function dropRepeatedPrefix(previous: string, current: string, contiguous: boolean): string {
  const previousKeys = words(previous).map(key);
  const currentWords = words(current);
  const currentKeys = currentWords.map(key);
  const longest = Math.min(previousKeys.length, currentWords.length);

  for (let k = longest; k >= 1; k--) {
    const matches = previousKeys
      .slice(previousKeys.length - k)
      .every((word, index) => word === currentKeys[index]);
    if (!matches) continue;
    // The whole cue already appeared: it is the ASR's 10ms ghost cue.
    if (k === currentWords.length) return '';
    if (k >= MIN_OVERLAP) return currentWords.slice(k).join(' ');
    if (contiguous && k === previousKeys.length) return currentWords.slice(k).join(' ');
    return current;
  }

  return current;
}

/**
 * A cue can stay on screen long after its last word — 20s of it, over music.
 * Its end would drag the segment far past `maxMs` and leave the player waiting
 * in silence, so the trailing silence goes, with a tail so the last word is
 * never clipped. Only ASR tracks carry the word timings this needs.
 */
const TRAILING_SILENCE_MS = 1500;
const LAST_WORD_TAIL_MS = 800;

function trimTrailingSilence(cue: Cue): Cue {
  const { speechEndMs } = cue;
  if (speechEndMs === undefined) return cue;
  if (cue.endMs - speechEndMs <= TRAILING_SILENCE_MS) return cue;

  return { ...cue, endMs: Math.min(cue.endMs, speechEndMs + LAST_WORD_TAIL_MS) };
}

/** Drops `prefix` from the head of `text`, or returns `null` if it is not there. */
function dropPrefix(prefix: string, text: string): string | null {
  const prefixKeys = words(prefix).map(key);
  const textWords = words(text);
  if (prefixKeys.length === 0 || prefixKeys.length > textWords.length) return null;

  const matches = prefixKeys.every((word, index) => word === key(textWords[index]));
  return matches ? textWords.slice(prefixKeys.length).join(' ') : null;
}

export function cleanCues(cues: Cue[], options: Required<SegmentOptions>): Cue[] {
  const kept: Cue[] = [];
  /**
   * The text of the cue just dropped for repeating everything already seen —
   * the ASR's 10ms *ghost cue*. YouTube redraws that same line at the head of
   * the next cue, so its text is the one prefix we can strip on sight, however
   * short it is: "were drunk." / "were drunk. And the longer…".
   */
  let ghost: string | null = null;

  for (const cue of cues) {
    const text = options.stripNonSpeech ? stripNonSpeech(cue.text) : cue.text.trim();
    if (text === '') continue;

    const previous = kept[kept.length - 1];
    const contiguous = previous !== undefined && cue.startMs - previous.endMs <= CONTIGUOUS_MS;
    const afterGhost = ghost !== null ? (dropPrefix(ghost, text) ?? text) : text;
    const deduped =
      afterGhost === ''
        ? ''
        : previous
          ? dropRepeatedPrefix(previous.text, afterGhost, contiguous)
          : afterGhost;

    if (deduped === '') {
      ghost = text;
      continue;
    }

    ghost = null;
    kept.push(trimTrailingSilence({ ...cue, text: deduped }));
  }

  return kept;
}

// ----------------------------------------------------------- segmentation

const SENTENCE_END = /[.!?]["'”’)\]]*$/;
const WEAK_PUNCTUATION = /[,;:—–-]["'”’)\]]*$/;

/** How far past `maxWords` a segment may go to avoid leaving a scrap behind. */
const WORD_TOLERANCE = 5;

type Pending = { cues: Cue[]; startMs: number; endMs: number; text: string };

function close(pending: Pending, index: number): Segment {
  return {
    index,
    startMs: pending.startMs,
    endMs: pending.endMs,
    referenceText: pending.text,
    sourceCueIds: pending.cues.map((cue) => cue.id),
  };
}

export function segment(cues: Cue[], options: SegmentOptions = {}): Segment[] {
  const opts = { ...DEFAULTS, ...options };
  const cleaned = cleanCues(cues, opts);
  if (cleaned.length === 0) return [];

  const segments: Segment[] = [];
  let pending: Pending | null = null;

  const emit = () => {
    if (!pending) return;
    segments.push(close(pending, segments.length));
    pending = null;
  };

  for (let i = 0; i < cleaned.length; i++) {
    const cue = cleaned[i];
    const next = cleaned[i + 1];

    if (pending === null) {
      pending = { cues: [cue], startMs: cue.startMs, endMs: cue.endMs, text: cue.text };
    } else {
      const candidateDuration = cue.endMs - pending.startMs;
      const candidateWords = countWords(`${pending.text} ${cue.text}`);
      // Emitting what is pending would produce a scrap nobody can practise, so
      // the caps stretch rather than break — up to the tolerance below.
      const rescuingAScrap = pending.endMs - pending.startMs < opts.minMs;
      const wordCap = rescuingAScrap ? opts.maxWords + WORD_TOLERANCE : opts.maxWords;
      const durationCap = rescuingAScrap ? opts.maxMs + opts.minMs : opts.maxMs;
      const wouldOverflow = candidateWords > wordCap || candidateDuration > durationCap;

      if (wouldOverflow) {
        emit();
        pending = { cues: [cue], startMs: cue.startMs, endMs: cue.endMs, text: cue.text };
      } else {
        pending = {
          cues: [...pending.cues, cue],
          startMs: pending.startMs,
          endMs: cue.endMs,
          text: `${pending.text} ${cue.text}`,
        };
      }
    }

    const duration = pending.endMs - pending.startMs;
    const totalWords = countWords(pending.text);
    const gap = next ? next.startMs - pending.endMs : Infinity;

    // Hard caps first: past them there is no choice.
    if (totalWords >= opts.maxWords || duration >= opts.maxMs) {
      emit();
      continue;
    }

    if (duration < opts.targetMinMs) continue;

    // Within target: look for the best break, in the order the spec lists.
    if (SENTENCE_END.test(pending.text)) {
      emit();
    } else if (gap >= opts.silenceGapMs) {
      emit();
    } else if (
      WEAK_PUNCTUATION.test(pending.text) &&
      duration >= (opts.targetMinMs + opts.maxMs) / 2
    ) {
      emit();
    }
  }

  emit();
  return reindex(mergeScraps(segments, opts));
}

function join(first: Segment, second: Segment): Segment {
  return {
    index: first.index,
    startMs: first.startMs,
    endMs: second.endMs,
    referenceText: `${first.referenceText} ${second.referenceText}`,
    sourceCueIds: [...first.sourceCueIds, ...second.sourceCueIds],
  };
}

/** Would joining these two produce something still practiceable? */
function fits(first: Segment, second: Segment, options: Required<SegmentOptions>): boolean {
  const merged = join(first, second);
  return (
    countWords(merged.referenceText) <= options.maxWords + WORD_TOLERANCE &&
    merged.endMs - merged.startMs <= options.maxMs + options.minMs
  );
}

/**
 * A segment below `minMs` is not practiceable — half a second of audio is a
 * blink. Most are gone before this runs (the caps stretch to avoid making
 * one), but a cue followed by a long silence still produces them, so they go
 * back into a neighbour: the previous one by preference, since the break was
 * chosen on the *left* edge; the next one when that does not fit.
 *
 * A scrap surrounded by segments that are already full stays as it is. Better
 * a short segment than one nobody can hold in their head.
 */
function mergeScraps(segments: Segment[], options: Required<SegmentOptions>): Segment[] {
  const merged: Segment[] = [];

  for (const current of segments) {
    const previous = merged[merged.length - 1];
    if (
      previous !== undefined &&
      current.endMs - current.startMs < options.minMs &&
      fits(previous, current, options)
    ) {
      merged[merged.length - 1] = join(previous, current);
      continue;
    }

    if (
      previous !== undefined &&
      previous.endMs - previous.startMs < options.minMs &&
      fits(previous, current, options)
    ) {
      merged[merged.length - 1] = join(previous, current);
      continue;
    }

    merged.push(current);
  }

  return merged;
}

function reindex(segments: Segment[]): Segment[] {
  return segments.map((segment, index) => ({ ...segment, index }));
}
