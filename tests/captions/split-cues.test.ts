import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCaptions } from '@/lib/captions/parse-captions';
import { countWords, segment, segmentAt, SEGMENT_SIZES } from '@/lib/captions/segmenter';
import { splitCues } from '@/lib/captions/split-cues';
import type { Cue } from '@/types';

const fixture = (name: string) =>
  parseCaptions(readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8'))
    .cues;

/** Sugar for building cues in tests: `cue(0, 2, 'text')` in seconds. */
const cue = (startSec: number, endSec: number, text: string, id = ''): Cue => ({
  id: id || `c${startSec}`,
  startMs: startSec * 1000,
  endMs: endSec * 1000,
  text,
});

const texts = (cues: Cue[]) => cues.map((current) => current.text);

describe('splitCues', () => {
  it('cuts a cue at its sentence ends', () => {
    const pieces = splitCues([cue(0, 4, 'Hi everybody. Welcome back to my channel.')], 10, 700);
    expect(texts(pieces)).toEqual(['Hi everybody.', 'Welcome back to my channel.']);
  });

  it('moves the start of a sentence forward to the cue that finishes it', () => {
    const pieces = splitCues(
      [cue(0, 4, 'Welcome back to my channel. Today'), cue(4, 9, "we're going to talk about anxiety.")],
      10,
      700,
    );
    expect(texts(pieces)).toEqual(['Welcome back to my channel.', "Today we're going to talk about anxiety."]);
  });

  it('cuts at commas too', () => {
    const pieces = splitCues([cue(0, 4, 'Now, I got over it')], 10, 700);
    expect(texts(pieces)).toEqual(['Now,', 'I got over it']);
  });

  it('cuts at a pause between cues', () => {
    const pieces = splitCues([cue(0, 2, 'and then'), cue(4, 6, 'it rained')], 10, 700);
    expect(texts(pieces)).toEqual(['and then', 'it rained']);
  });

  it('splits a long run of words into even parts', () => {
    const words = Array.from({ length: 14 }, (_, index) => `w${index}`).join(' ');
    const pieces = splitCues([cue(0, 7, words)], 6, 700);
    expect(pieces.map((piece) => countWords(piece.text))).toEqual([5, 5, 4]);
  });

  it('shares the cue time out in order, without leaving the cue', () => {
    const pieces = splitCues([cue(10, 16, 'One two three. Four five six. Seven eight nine.')], 10, 700);
    expect(pieces[0].startMs).toBe(10_000);
    expect(pieces[pieces.length - 1].endMs).toBe(16_000);
    for (let i = 1; i < pieces.length; i++) {
      expect(pieces[i].startMs).toBe(pieces[i - 1].endMs);
      expect(pieces[i].endMs).toBeGreaterThan(pieces[i].startMs);
    }
  });

  it('gives every piece its own id', () => {
    const pieces = splitCues([cue(0, 4, 'One. Two. Three.', 'a')], 10, 700);
    expect(new Set(pieces.map((piece) => piece.id)).size).toBe(pieces.length);
  });
});

describe('segmentAt', () => {
  const cues = fixture('manual.srt');

  it('is the segmenter as it always was at the long size', () => {
    expect(segmentAt(cues, 'long')).toEqual(segment(cues));
  });

  it('makes the pieces shorter at each step down', () => {
    const averageWords = (size: (typeof SEGMENT_SIZES)[number]) => {
      const segments = segmentAt(cues, size);
      return segments.reduce((sum, current) => sum + countWords(current.referenceText), 0) / segments.length;
    };
    expect(averageWords('short')).toBeLessThan(averageWords('medium'));
    expect(averageWords('medium')).toBeLessThanOrEqual(averageWords('long'));
  });

  it.each(SEGMENT_SIZES)('keeps every word, in order, at %s', (size) => {
    const words = (text: string) => text.split(/\s+/).filter(Boolean);
    const all = segment(cues).flatMap((current) => words(current.referenceText));
    expect(segmentAt(cues, size).flatMap((current) => words(current.referenceText))).toEqual(all);
  });

  it.each(SEGMENT_SIZES)('numbers the segments in time order at %s', (size) => {
    const segments = segmentAt(cues, size);
    segments.forEach((current, index) => {
      expect(current.index).toBe(index);
      if (index > 0) expect(current.startMs).toBeGreaterThanOrEqual(segments[index - 1].endMs);
    });
  });
});
