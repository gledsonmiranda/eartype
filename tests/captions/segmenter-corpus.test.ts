/**
 * Invariants over real captions — the five videos of `fixtures/corpus`.
 *
 * The hand-written fixtures test the rules one at a time; this suite tests
 * what has to hold over a whole video, because that is where the segmenter
 * failed: scraps of under a second, cues that stay on screen for 20s, rolling
 * text repeated one word at a time. See docs/SPIKE-RESULTS.md §S-1c.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCaptions } from '@/lib/captions/parse-captions';
import { countWords, segment } from '@/lib/captions/segmenter';
import type { Segment } from '@/types';

const MIN_MS = 1500;
const MAX_MS = 8000;
const MAX_WORDS = 15;
/** What a segment may borrow from the next one rather than leave a scrap. */
const WORD_TOLERANCE = 5;

const CORPUS = [
  '01-manual-mkbhd.en.vtt',
  '02-asr-sandeep.en.vtt',
  '03-asr-long-melrobbins.en.vtt',
  '04-asr-small-channel.en.vtt',
  '05-asr-restricted-guess.en.vtt',
] as const;

const segmentsOf = (name: string): Segment[] =>
  segment(
    parseCaptions(
      readFileSync(fileURLToPath(new URL(`../fixtures/corpus/${name}`, import.meta.url)), 'utf8'),
    ).cues,
  );

const wordKeys = (text: string): string[] =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, ''));

/** How many words the head of `next` repeats from the tail of `previous`. */
function overlap(previous: Segment, next: Segment): number {
  const before = wordKeys(previous.referenceText);
  const after = wordKeys(next.referenceText);

  for (let k = Math.min(6, before.length, after.length); k >= 1; k--) {
    if (before.slice(before.length - k).every((word, index) => word === after[index])) return k;
  }
  return 0;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
};

describe.each(CORPUS)('%s', (name) => {
  const segments = segmentsOf(name);

  it('produces segments', () => {
    expect(segments.length).toBeGreaterThan(100);
  });

  it('has nothing too short to practise', () => {
    const scraps = segments.filter((s) => s.endMs - s.startMs < MIN_MS);
    expect(scraps.map((s) => `${s.endMs - s.startMs}ms — ${s.referenceText}`)).toEqual([]);
  });

  it('keeps every segment within reach of the duration cap', () => {
    // A rescued scrap may push its segment one `minMs` past `maxMs`.
    const tooLong = segments.filter((s) => s.endMs - s.startMs > MAX_MS + MIN_MS);
    expect(tooLong.map((s) => `${s.endMs - s.startMs}ms — ${s.referenceText}`)).toEqual([]);
  });

  it('keeps every segment within reach of the word cap', () => {
    // A lone cue is never split (RF-03), so only grouped segments are capped.
    const tooLong = segments.filter(
      (s) =>
        s.sourceCueIds.length > 1 && countWords(s.referenceText) > MAX_WORDS + WORD_TOLERANCE,
    );
    expect(tooLong.map((s) => `${countWords(s.referenceText)}w — ${s.referenceText}`)).toEqual([]);
  });

  it('leaves no markup behind', () => {
    const dirty = segments.filter((s) => /\[|\]|♪|♫|>>/.test(s.referenceText));
    expect(dirty.map((s) => s.referenceText)).toEqual([]);
  });

  it('moves forward in time, without overlapping itself', () => {
    const backwards = segments.filter(
      (s, i) => s.endMs <= s.startMs || (i > 0 && s.startMs < segments[i - 1].endMs),
    );
    expect(backwards.map((s) => `${s.index}: ${s.startMs}–${s.endMs}`)).toEqual([]);
  });

  it('never repeats three words across a boundary — that is rolling text', () => {
    // One or two repeated words are real speech ("blah, / blah, blah…"), three
    // are the ASR redrawing the previous line.
    const repeats = segments
      .map((s, i) => (i === 0 ? 0 : overlap(segments[i - 1], s)))
      .map((k, i) => ({ k, i }))
      .filter(({ k }) => k >= 3);

    expect(
      repeats.map(({ i }) => `«${segments[i - 1].referenceText}» / «${segments[i].referenceText}»`),
    ).toEqual([]);
  });

  it('lands on a practiceable size, not merely a legal one', () => {
    const durations = segments.map((s) => s.endMs - s.startMs);
    expect(median(durations)).toBeGreaterThanOrEqual(2500);
    expect(median(durations)).toBeLessThanOrEqual(6000);
    expect(median(segments.map((s) => countWords(s.referenceText)))).toBeLessThanOrEqual(MAX_WORDS);
  });
});
