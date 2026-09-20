import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCaptions } from '@/lib/captions/parse-captions';
import { countWords, segment, stripNonSpeech } from '@/lib/segmenter';
import type { Cue } from '@/types';

const fixture = (name: string) =>
  parseCaptions(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'))
    .cues;

/** Sugar for building cues in tests: `cue(0, 2, 'text')` in seconds. */
const cue = (startSec: number, endSec: number, text: string, id = ''): Cue => ({
  id: id || `c${startSec}`,
  startMs: startSec * 1000,
  endMs: endSec * 1000,
  text,
});

describe('stripNonSpeech', () => {
  it.each([
    ['[Music]', ''],
    ['[Applause]', ''],
    ['[ __ ] you', 'you'],
    ['(baaaaaaaaaaahhh!!)', ''],
    ['♪ la la la ♪', 'la la la'],
    ['>> and then he said', 'and then he said'],
    ['>>> JOHN: and then he said', 'and then he said'],
    ['NARRATOR: once upon a time', 'once upon a time'],
    ['DR. SMITH: hello', 'hello'],
    ['Well: that is different', 'Well: that is different'],
    ['ordinary text', 'ordinary text'],
  ])('%s → %s', (input, expected) => {
    expect(stripNonSpeech(input)).toBe(expected);
  });
});

describe('segment — grouping rules', () => {
  it('joins short cues until it reaches the target floor', () => {
    const segments = segment([
      cue(0, 1, 'the cool thing'),
      cue(1, 2, 'about these guys'),
      cue(2, 3.5, 'is that they have really long trunks'),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0].referenceText).toBe(
      'the cool thing about these guys is that they have really long trunks',
    );
    expect(segments[0].startMs).toBe(0);
    expect(segments[0].endMs).toBe(3500);
  });

  it('breaks at sentence-final punctuation once past the target floor', () => {
    const segments = segment([
      cue(0, 3.2, 'All right, so here we are.'),
      cue(3.2, 6.4, 'In front of the elephants.'),
    ]);
    expect(segments.map((s) => s.referenceText)).toEqual([
      'All right, so here we are.',
      'In front of the elephants.',
    ]);
  });

  it('below the target floor, final punctuation is not enough to break', () => {
    const segments = segment([
      cue(0, 2, 'All right, so here we are.'),
      cue(2, 4, 'In front of the elephants.'),
    ]);
    expect(segments.map((s) => s.referenceText)).toEqual([
      'All right, so here we are. In front of the elephants.',
    ]);
  });

  it('breaks on a silence of 700ms or more when there is no punctuation', () => {
    const segments = segment([
      cue(0, 3.2, 'all right so here we are'),
      cue(4.5, 7, 'in front of the elephants'),
    ]);
    expect(segments).toHaveLength(2);
  });

  it('does not break on a short silence', () => {
    const segments = segment([
      cue(0, 3.2, 'all right so here we are'),
      cue(3.4, 5.5, 'in front of the elephants'),
    ]);
    expect(segments).toHaveLength(1);
  });

  it('never breaks in the middle of a cue', () => {
    const segments = segment([cue(0, 4, 'one sentence. another one in the same cue.')]);
    expect(segments).toHaveLength(1);
    expect(segments[0].sourceCueIds).toHaveLength(1);
  });

  it('respects the word cap', () => {
    const cues = Array.from({ length: 8 }, (_, i) =>
      cue(i * 0.5, (i + 1) * 0.5, 'one two three', `c${i}`),
    );
    expect(segment(cues).every((s) => countWords(s.referenceText) <= 15)).toBe(true);
  });

  it('respects the duration cap', () => {
    const cues = Array.from({ length: 6 }, (_, i) =>
      cue(i * 2.5, (i + 1) * 2.5, `sentence ${i}`, `c${i}`),
    );
    expect(segment(cues).every((s) => s.endMs - s.startMs <= 8000)).toBe(true);
  });

  it('an oversized lone cue passes through whole — the spec forbids splitting one', () => {
    const huge = cue(0, 20, Array.from({ length: 40 }, (_, i) => `w${i}`).join(' '));
    const segments = segment([huge]);
    expect(segments).toHaveLength(1);
    expect(countWords(segments[0].referenceText)).toBe(40);
  });

  it('indexes the segments in order from zero', () => {
    const cues = Array.from({ length: 10 }, (_, i) =>
      cue(i * 3, i * 3 + 2.9, `sentence number ${i} with a few words.`, `c${i}`),
    );
    const segments = segment(cues);
    expect(segments.map((s) => s.index)).toEqual([...segments.keys()]);
  });

  it('keeps track of where each segment came from', () => {
    const segments = segment([
      cue(0, 1.5, 'the first part', 'a'),
      cue(1.5, 3.2, 'the second part here', 'b'),
    ]);
    expect(segments[0].sourceCueIds).toEqual(['a', 'b']);
  });

  it('an empty caption gives an empty list', () => {
    expect(segment([])).toEqual([]);
    expect(segment([cue(0, 2, '[Music]')])).toEqual([]);
  });

  it('a short trailing scrap goes back into the previous segment', () => {
    const segments = segment([
      cue(0, 3.5, 'a reasonably long sentence right here.'),
      cue(3.5, 3.9, 'scrap'),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0].referenceText).toMatch(/scrap$/);
    expect(segments[0].endMs).toBe(3900);
  });

  it('accepts custom options', () => {
    const cues = [cue(0, 2, 'one two three'), cue(2, 4, 'four five six')];
    expect(segment(cues, { maxWords: 3 })).toHaveLength(2);
  });
});

describe('segment — ASR rolling-text dedupe', () => {
  it('drops the ghost cue that only repeats the previous one', () => {
    const segments = segment([
      cue(0, 2.9, 'all right so here we are'),
      cue(2.909, 2.919, 'all right so here we are'),
      cue(2.919, 5.66, 'all right so here we are in front of the elephants'),
    ]);
    expect(segments.map((s) => s.referenceText)).toEqual([
      'all right so here we are in front of the elephants',
    ]);
  });

  it('does not cut a short repetition of real speech', () => {
    const segments = segment([
      cue(0, 2.9, 'is that they have really...'),
      cue(2.9, 5.5, 'really really long trunks'),
    ]);
    expect(segments[0].referenceText).toBe(
      'is that they have really... really really long trunks',
    );
  });
});

describe('segment — real fixtures', () => {
  it.each(['manual.en.vtt', 'manual.srt', 'asr.en.vtt'])('%s satisfies the limits', (name) => {
    const segments = segment(fixture(name));

    expect(segments.length).toBeGreaterThan(0);
    for (const s of segments) {
      expect(countWords(s.referenceText), `words in "${s.referenceText}"`).toBeLessThanOrEqual(15);
      expect(s.endMs - s.startMs, `duration of "${s.referenceText}"`).toBeGreaterThanOrEqual(1500);
      expect(s.referenceText).not.toMatch(/\[|\]|♪|>>/);
      expect(s.endMs).toBeGreaterThan(s.startMs);
    }

    // No gaps backwards and no overlap: segments move forward in time.
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].startMs).toBeGreaterThanOrEqual(segments[i - 1].endMs);
    }
  });

  it('the ASR rolling text does not show up twice', () => {
    const text = segment(fixture('asr.en.vtt'))
      .map((s) => s.referenceText)
      .join(' ');
    expect((text.match(/in front of the elephants/g) ?? []).length).toBe(1);
    expect((text.match(/all right so here we are/g) ?? []).length).toBe(1);
  });

  it('[Music] is gone from the ASR track', () => {
    expect(segment(fixture('asr.en.vtt')).some((s) => /music/i.test(s.referenceText))).toBe(false);
  });
});
