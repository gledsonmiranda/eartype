import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CaptionParseError, parseCaptions, stripInlineTags } from '@/lib/captions/parse-captions';

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');

describe('parseCaptions — SRT', () => {
  const srt = `1
00:00:01,200 --> 00:00:03,360
All right, so here we are

2
00:00:05,318 --> 00:00:07,974
in front of the elephants
`;

  it('detects the format', () => {
    expect(parseCaptions(srt).format).toBe('srt');
  });

  it('reads comma timestamps', () => {
    const { cues } = parseCaptions(srt);
    expect(cues[0]).toEqual({
      id: 'c0',
      startMs: 1200,
      endMs: 3360,
      text: 'All right, so here we are',
    });
  });

  it('joins the lines of one cue into a single text', () => {
    const { cues } = parseCaptions('1\n00:00:00,000 --> 00:00:02,000\nfirst line\nsecond line\n');
    expect(cues[0].text).toBe('first line second line');
  });

  it('accepts CRLF', () => {
    const { cues } = parseCaptions(srt.replace(/\n/g, '\r\n'));
    expect(cues).toHaveLength(2);
    expect(cues[1].text).toBe('in front of the elephants');
  });

  it('accepts a leading BOM', () => {
    expect(parseCaptions(`﻿${srt}`).cues).toHaveLength(2);
  });

  it('accepts a file with no trailing newline', () => {
    expect(parseCaptions(srt.trimEnd()).cues).toHaveLength(2);
  });

  it('accepts blocks separated by several blank lines', () => {
    expect(parseCaptions(srt.replace('\n\n2', '\n\n\n\n2')).cues).toHaveLength(2);
  });

  it('numbers the cues in order from zero', () => {
    expect(parseCaptions(srt).cues.map((cue) => cue.id)).toEqual(['c0', 'c1']);
  });
});

describe('parseCaptions — WebVTT', () => {
  it('detects the format and skips the header', () => {
    const { cues, format } = parseCaptions(fixture('manual.en.vtt'));
    expect(format).toBe('vtt');
    expect(cues).toHaveLength(6);
    expect(cues[0].startMs).toBe(1200);
    expect(cues[0].text).toBe('All right, so here we are, in front of the elephants');
  });

  it('reads dot timestamps', () => {
    const { cues } = parseCaptions('WEBVTT\n\n00:00:12.616 --> 00:00:14.367\nand that’s cool\n');
    expect(cues[0]).toMatchObject({ startMs: 12_616, endMs: 14_367 });
  });

  it('accepts a timestamp without hours (MM:SS.mmm)', () => {
    const { cues } = parseCaptions('WEBVTT\n\n01:30.500 --> 01:32.000\nhello\n');
    expect(cues[0].startMs).toBe(90_500);
  });

  it('ignores cue settings after the timestamp', () => {
    const { cues } = parseCaptions(
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000 align:start position:0%\ntext\n',
    );
    expect(cues[0].text).toBe('text');
  });

  it('ignores NOTE, STYLE and REGION blocks', () => {
    const vtt = `WEBVTT

NOTE
this comment is not a caption
and it goes on

STYLE
::cue { color: yellow }

REGION
id:speaker width:40%

00:00:01.000 --> 00:00:02.000
the real text
`;
    const { cues } = parseCaptions(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('the real text');
  });

  it('accepts a textual identifier before the timestamp', () => {
    const { cues } = parseCaptions('WEBVTT\n\nintro\n00:00:01.000 --> 00:00:02.000\ntext\n');
    expect(cues[0].text).toBe('text');
  });

  it('drops cues that held nothing but markup', () => {
    const { cues } = parseCaptions(
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n \n\n00:00:03.000 --> 00:00:04.000\ntext\n',
    );
    expect(cues).toHaveLength(1);
  });

  it('sorts cues by start time', () => {
    const { cues } = parseCaptions(
      'WEBVTT\n\n00:00:05.000 --> 00:00:06.000\nsecond\n\n00:00:01.000 --> 00:00:02.000\nfirst\n',
    );
    expect(cues.map((cue) => cue.text)).toEqual(['first', 'second']);
  });

  it('reads the whole ASR fixture without choking', () => {
    const { cues } = parseCaptions(fixture('asr.en.vtt'));
    expect(cues.length).toBeGreaterThan(5);
    expect(cues.every((cue) => !cue.text.includes('<'))).toBe(true);
  });
});

describe('stripInlineTags', () => {
  it.each([
    ['<i>All right</i>, so here we are', 'All right, so here we are'],
    ['<c.colorE5E5E5>text</c>', 'text'],
    ['<v Roger Bingham>text', 'text'],
    ['all<00:00:00.539> right<00:00:00.960> so', 'all right so'],
    ['and that&#39;s cool', "and that's cool"],
    ['a &amp; b', 'a & b'],
    ['&lt;not a tag&gt;', '<not a tag>'],
    ['too     many spaces', 'too many spaces'],
  ])('%s → %s', (input, expected) => {
    expect(stripInlineTags(input)).toBe(expected);
  });

  it('runs inside the parser: the SRT fixture comes out clean', () => {
    const { cues } = parseCaptions(fixture('manual.srt'));
    expect(cues[0].text).toBe('All right, so here we are, in front of the elephants');
    expect(cues[3].text).toBe("and that's cool");
  });
});

describe('parseCaptions — invalid input gives a readable error', () => {
  it('empty', () => {
    expect(() => parseCaptions('')).toThrow(CaptionParseError);
    expect(() => parseCaptions('   ')).toThrow(/vazia/);
  });

  it('text that is not a caption', () => {
    expect(() => parseCaptions('just some text\nwith no timestamps')).toThrow(/timestamp/);
  });

  it('a malformed timestamp points at the line', () => {
    try {
      parseCaptions('1\n00:00:01 --> 00:00:03\ntext\n');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CaptionParseError);
      expect((error as CaptionParseError).line).toBe(2);
      expect((error as Error).message).toMatch(/timestamp inválido/);
    }
  });

  it('seconds out of range', () => {
    expect(() => parseCaptions('1\n00:00:99,000 --> 00:00:03,000\ntext\n')).toThrow(/faixa/);
  });

  it('a block with no timing line', () => {
    expect(() =>
      parseCaptions('1\ntext with no timing\n\n2\n00:00:01,000 --> 00:00:02,000\nok\n'),
    ).toThrow(CaptionParseError);
  });

  it('VTT with only a header', () => {
    expect(() => parseCaptions('WEBVTT\nKind: captions\n')).toThrow(/nenhuma legenda/);
  });

  it('never blows up with a TypeError on non-string input', () => {
    // @ts-expect-error — input coming from the UI can be anything.
    expect(() => parseCaptions(null)).toThrow(CaptionParseError);
  });
});

describe('parseCaptions — the YouTube ASR trap', () => {
  // The space-only lines below are the whole point of these tests, so they are
  // spelled out with escapes instead of being typed into a template literal —
  // any editor or formatter would strip trailing whitespace away.
  it('a line holding a single space inside the cue does not end the block', () => {
    const vtt = [
      'WEBVTT',
      '',
      '00:00:00.030 --> 00:00:02.909 align:start position:0%',
      ' ',
      'all<00:00:00.539> right<00:00:00.960> so',
      '',
    ].join('\n');

    const { cues } = parseCaptions(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('all right so');
  });

  it('but whitespace followed by a new cue does end it', () => {
    const vtt = [
      'WEBVTT',
      '',
      '00:00:01.000 --> 00:00:02.000',
      'first',
      '   ',
      '00:00:03.000 --> 00:00:04.000',
      'second',
      '',
    ].join('\n');

    expect(parseCaptions(vtt).cues.map((cue) => cue.text)).toEqual(['first', 'second']);
  });
});

describe('parseCaptions — word-level timings', () => {
  it('records when the last word of the cue starts', () => {
    const vtt = [
      'WEBVTT',
      '',
      '00:00:55.800 --> 00:01:16.950',
      'for<00:00:55.960><c> the</c><00:00:56.320><c> rest</c><00:00:56.560><c> of my life.</c>',
      '',
    ].join('\n');

    expect(parseCaptions(vtt).cues[0].speechEndMs).toBe(56_560);
  });

  it('leaves it undefined on a track without inline timings', () => {
    const vtt = ['WEBVTT', '', '00:00:01.000 --> 00:00:04.000', 'plain caption text', ''].join(
      '\n',
    );

    expect(parseCaptions(vtt).cues[0].speechEndMs).toBeUndefined();
  });

  it('ignores a timing that lands before the cue starts', () => {
    const vtt = [
      'WEBVTT',
      '',
      '00:00:10.000 --> 00:00:14.000',
      'leftover<00:00:02.000><c> timing</c>',
      '',
    ].join('\n');

    expect(parseCaptions(vtt).cues[0].speechEndMs).toBeUndefined();
  });
});
