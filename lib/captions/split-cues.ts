/**
 * Cuts cues smaller than they arrived — what the shorter segment sizes stand on.
 *
 * Hand-typed captions often pack 20 words and two or three sentences into one
 * cue, and break it wherever the line ran out: "…welcome back to my channel.
 * Today" / "we're going to talk about…". The segmenter only ever *groups* cues,
 * so on its own it can never make those shorter.
 *
 * Here the cues become one stream of words, re-cut where the speech breaks —
 * sentence ends, then commas and friends, then pauses between cues — so a
 * sentence that starts at the tail of one cue moves forward to join the rest of
 * it. A piece still longer than `maxWords` is cut into even parts.
 *
 * Manual captions carry no word timings, so each word's time is estimated:
 * the cue's duration, spread in proportion to the characters. Good to a few
 * hundred milliseconds, which is what the player's own margins already absorb.
 *
 * No React, no DOM, no network: `Cue[]` in, `Cue[]` out.
 */

import type { Cue } from '@/types';

export const SENTENCE_END = /[.!?]["'”’)\]]*$/;
export const WEAK_PUNCTUATION = /[,;:—–-]["'”’)\]]*$/;

type TimedWord = { text: string; startMs: number; endMs: number; cueId: string };

/** Each word of the cue, with the cue's time shared out by length. */
function timedWords(cue: Cue): TimedWord[] {
  const texts = cue.text.split(/\s+/).filter(Boolean);
  // The space after a word is part of the time it takes to say it.
  const weights = texts.map((text) => text.length + 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const duration = cue.endMs - cue.startMs;

  let elapsed = 0;
  return texts.map((text, index) => {
    const startMs = cue.startMs + Math.round((duration * elapsed) / total);
    elapsed += weights[index];
    const endMs = cue.startMs + Math.round((duration * elapsed) / total);
    return { text, startMs, endMs, cueId: cue.id };
  });
}

/** Runs of words that end where the speech breaks. */
function phrases(cues: Cue[], silenceGapMs: number): TimedWord[][] {
  const result: TimedWord[][] = [];
  let current: TimedWord[] = [];

  cues.forEach((cue, index) => {
    const words = timedWords(cue);
    words.forEach((word, position) => {
      current.push(word);
      const lastOfCue = position === words.length - 1;
      const next = cues[index + 1];
      const pause = lastOfCue && next !== undefined && next.startMs - cue.endMs >= silenceGapMs;
      if (SENTENCE_END.test(word.text) || WEAK_PUNCTUATION.test(word.text) || pause) {
        result.push(current);
        current = [];
      }
    });
  });

  if (current.length > 0) result.push(current);
  return result;
}

/** Cuts a phrase into the fewest even parts that each fit `maxWords`. */
function evenParts(words: TimedWord[], maxWords: number): TimedWord[][] {
  const count = Math.ceil(words.length / maxWords);
  const size = Math.ceil(words.length / count);
  const parts: TimedWord[][] = [];
  for (let start = 0; start < words.length; start += size) parts.push(words.slice(start, start + size));
  return parts;
}

function toCue(words: TimedWord[], index: number): Cue {
  return {
    id: `${words[0].cueId}#${index}`,
    startMs: words[0].startMs,
    endMs: words[words.length - 1].endMs,
    text: words.map((word) => word.text).join(' '),
  };
}

export function splitCues(cues: Cue[], maxWords: number, silenceGapMs: number): Cue[] {
  return phrases(cues, silenceGapMs)
    .flatMap((phrase) => evenParts(phrase, maxWords))
    .map(toCue);
}
