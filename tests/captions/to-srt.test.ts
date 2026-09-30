import { describe, expect, it } from 'vitest';
import { parseCaptions } from '@/lib/captions/parse-captions';
import { cuesToSrt, formatSrtTime } from '@/lib/captions/to-srt';
import type { Cue } from '@/types';

describe('formatSrtTime', () => {
  it('pads every field', () => {
    expect(formatSrtTime(0)).toBe('00:00:00,000');
    expect(formatSrtTime(83_456)).toBe('00:01:23,456');
    expect(formatSrtTime(3_723_004)).toBe('01:02:03,004');
  });

  it('clamps negatives and rounds fractions', () => {
    expect(formatSrtTime(-5)).toBe('00:00:00,000');
    expect(formatSrtTime(1000.6)).toBe('00:00:01,001');
  });
});

describe('cuesToSrt', () => {
  const cues: Cue[] = [
    { id: 'a', startMs: 1000, endMs: 3000, text: 'Hello there.' },
    { id: 'b', startMs: 3500, endMs: 6250, text: 'Two\nlines.', speechEndMs: 6000 },
  ];

  it('writes numbered SRT blocks', () => {
    expect(cuesToSrt(cues)).toBe(
      '1\n00:00:01,000 --> 00:00:03,000\nHello there.\n\n2\n00:00:03,500 --> 00:00:06,250\nTwo\nlines.\n',
    );
  });

  it('round-trips through parseCaptions', () => {
    const parsed = parseCaptions(cuesToSrt(cues));
    expect(parsed.format).toBe('srt');
    expect(parsed.cues.map(({ startMs, endMs }) => [startMs, endMs])).toEqual([
      [1000, 3000],
      [3500, 6250],
    ]);
    expect(parsed.cues[0].text).toBe('Hello there.');
  });
});
