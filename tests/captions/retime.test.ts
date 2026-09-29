import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCaptions } from '@/lib/captions/parse-captions';
import { parseTimedWords, retimeCues, type TimedWord } from '@/lib/captions/retime';
import { segment } from '@/lib/captions/segmenter';
import type { Cue } from '@/types';

/** The first 90s of ohqxP8EEumo: both tracks, as yt-dlp wrote them. */
const fixture = (name: string) =>
  readFileSync(join(__dirname, '..', 'fixtures', 'retime', name), 'utf8');
const MANUAL = fixture('ohqxP8EEumo.manual.en.vtt');
const ASR = fixture('ohqxP8EEumo.asr.en.vtt');

const cue = (id: string, startMs: number, endMs: number, text: string): Cue => ({
  id,
  startMs,
  endMs,
  text,
});

const timed = (entries: [string, number][]): TimedWord[] =>
  entries.map(([text, startMs], index) => ({
    text,
    startMs,
    endMs: entries[index + 1]?.[1] ?? startMs + 300,
  }));

describe('parseTimedWords', () => {
  const words = parseTimedWords(ASR);

  it('reads each spoken word once, with its own start', () => {
    const opening = words.slice(0, 12).map((word) => word.text);
    expect(opening).toEqual([
      '[music]',
      '[music]',
      'So,',
      'if',
      'this',
      'were',
      'back',
      'in',
      '2011,',
      '[music]',
      'this',
      'is',
    ]);
    expect(words.find((word) => word.text === 'if')?.startMs).toBe(16720);
  });

  it('starts a line’s first word with the cue, and ends each word at the next', () => {
    const so = words.find((word) => word.text === 'So,');
    expect(so).toEqual({ text: 'So,', startMs: 16560, endMs: 16720 });
  });

  it('never lets a word run into a long pause', () => {
    for (const word of words) expect(word.endMs - word.startMs).toBeLessThanOrEqual(1000);
  });

  it('has nothing to say about a manual track', () => {
    expect(parseTimedWords(MANUAL)).toEqual([]);
  });
});

describe('retimeCues', () => {
  it('moves a cue that ends early onto the words it holds', () => {
    // Heard: "…a chip update," runs to ~26.1s; the manual cue ends at 25.38s.
    const words = timed([
      ['The', 22160],
      ['iPhone', 22320],
      ['with', 25120],
      ['a', 25440],
      ['chip', 25600],
      ['update,', 25840],
      ['a', 26400],
    ]);
    const [retimed] = retimeCues([cue('c0', 22277, 25380, 'The iPhone with a chip update,')], words);

    expect(retimed.startMs).toBe(22160);
    expect(retimed.endMs).toBe(26400);
  });

  it('moves a cue that starts late back to its first word', () => {
    const words = timed([
      ['I', 54000],
      ['love', 54200],
      ['this', 54400],
      ['phone', 54600],
    ]);
    const [retimed] = retimeCues([cue('c0', 54800, 56000, 'I love this phone')], words);
    expect(retimed.startMs).toBe(54000);
  });

  it('prefers the occurrence nearest the cue when the words repeat', () => {
    const words = timed([
      ['that', 10000],
      ['is', 10200],
      ['right', 10400],
      ['gap', 11000],
      ['that', 13000],
      ['is', 13200],
      ['right', 13400],
    ]);
    const [retimed] = retimeCues([cue('c0', 12800, 13800, 'that is right')], words);
    expect(retimed.startMs).toBe(13000);
  });

  it('keeps the timing of a cue it cannot find', () => {
    const original = cue('c0', 5000, 7000, 'nothing like the audio');
    const words = timed([
      ['completely', 5000],
      ['different', 5400],
      ['speech', 5800],
    ]);
    expect(retimeCues([original], words)).toEqual([original]);
  });

  it('does not let a one-word cue jump to a far-away common word', () => {
    const original = cue('c0', 5000, 5500, 'So');
    const words = timed([
      ['so', 8000],
      ['anyway', 8200],
    ]);
    expect(retimeCues([original], words)).toEqual([original]);
  });

  it('never cuts into a word it could not match at the edge', () => {
    // "Wow" is not in the ASR — the start stays where the caption put it.
    const words = timed([
      ['okay', 3100],
      ['then', 3300],
    ]);
    const [retimed] = retimeCues([cue('c0', 2800, 3800, 'Wow okay then')], words);
    expect(retimed.startMs).toBe(2800);
  });

  it('is a no-op without ASR words', () => {
    const cues = [cue('c0', 0, 1000, 'hello')];
    expect(retimeCues(cues, [])).toBe(cues);
  });
});

describe('ohqxP8EEumo, end to end', () => {
  const manual = parseCaptions(MANUAL).cues;
  const segments = segment(retimeCues(manual, parseTimedWords(ASR)));
  const find = (start: string) => segments.find((current) => current.referenceText.startsWith(start));

  it('keeps "chip update," inside the segment that asks for it (0:21)', () => {
    const current = find('an S update.');
    // "chip update," is spoken 25.60s–~26.1s.
    expect(current?.endMs).toBeGreaterThanOrEqual(26100);
  });

  it('starts the next one after it, on "a camera upgrade" (0:25)', () => {
    const current = find('a camera upgrade');
    // "a" is heard at 26.40s; the caption said 25.58s.
    expect(current?.startMs).toBeGreaterThanOrEqual(26200);
    expect(current?.startMs).toBeLessThanOrEqual(26400);
  });

  it('pulls a late cue back to its words (0:54)', () => {
    const late = manual.find((current) => current.startMs >= 54000 && current.startMs < 55000);
    const retimed = retimeCues(manual, parseTimedWords(ASR)).find((current) => current.id === late?.id);
    expect(late).toBeDefined();
    expect(retimed!.startMs).toBeLessThan(late!.startMs - 400);
  });

  it('keeps every word of the caption', () => {
    const retimed = retimeCues(manual, parseTimedWords(ASR));
    expect(retimed.map((current) => current.text)).toEqual(manual.map((current) => current.text));
  });
});
