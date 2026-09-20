/**
 * RF-02b — SRT and WebVTT parser, with automatic format detection.
 *
 * Accepts what you actually run into: CRLF, a BOM, `,` or `.` as the
 * millisecond separator, `NOTE`/`STYLE`/`REGION` blocks, inline tags (`<i>`,
 * `<c.x>`, `<00:00:01.000>`) and WebVTT cue settings after the timestamp.
 *
 * Knows nothing about the network or the DOM: text in, `Cue[]` out.
 *
 * User-facing error messages stay in Portuguese — they are shown as-is in the
 * UI, and SPEC.md writes them that way.
 */

import type { CaptionFormat, Cue } from '@/types';

export class CaptionParseError extends Error {
  /** 1-based, when a line can be pointed at; `undefined` when the whole file is the problem. */
  readonly line?: number;

  constructor(message: string, line?: number) {
    super(line === undefined ? message : `Linha ${line}: ${message}`);
    this.name = 'CaptionParseError';
    this.line = line;
  }
}

export type ParsedCaptions = {
  cues: Cue[];
  format: CaptionFormat;
};

/** `HH:MM:SS,mmm` (SRT) or `HH:MM:SS.mmm` / `MM:SS.mmm` (VTT). */
const TIMESTAMP = /^(?:(\d+):)?(\d{1,3}):(\d{1,2})[.,](\d{1,3})$/;

const CUE_TIMING_LINE = /^(\S+)\s*-->\s*(\S+)(?:\s+(.*))?$/;

function parseTimestamp(raw: string, line: number): number {
  const match = TIMESTAMP.exec(raw.trim());
  if (!match) throw new CaptionParseError(`timestamp inválido: "${raw}"`, line);

  const [, hours, minutes, seconds, millis] = match;
  const secondsValue = Number(seconds);
  const minutesValue = Number(minutes);
  if (secondsValue > 59) throw new CaptionParseError(`segundos fora da faixa: "${raw}"`, line);
  // In `MM:SS.mmm` (no hour) minutes may exceed 59; in `HH:MM:SS` they may not.
  if (hours !== undefined && minutesValue > 59) {
    throw new CaptionParseError(`minutos fora da faixa: "${raw}"`, line);
  }

  return (
    Number(hours ?? 0) * 3_600_000 +
    minutesValue * 60_000 +
    secondsValue * 1000 +
    Number(millis.padEnd(3, '0'))
  );
}

/** The word-level timings the ASR track inlines: `<00:00:01.000>`. */
const INLINE_TIMESTAMP = /<(\d{1,3}):(\d{2}):(\d{2})[.,](\d{1,3})>/g;

/**
 * When the last word of the cue starts, or `undefined` on a track without
 * word-level timings. See `Cue.speechEndMs`.
 */
function lastInlineTimestamp(body: string): number | undefined {
  let last: number | undefined;
  for (const match of body.matchAll(INLINE_TIMESTAMP)) {
    const [, hours, minutes, seconds, millis] = match;
    last =
      Number(hours) * 3_600_000 +
      Number(minutes) * 60_000 +
      Number(seconds) * 1000 +
      Number(millis.padEnd(3, '0'));
  }
  return last;
}

/** Strips what is markup rather than spoken text. */
export function stripInlineTags(text: string): string {
  return (
    text
      // Karaoke timestamps the ASR track inlines: <00:00:01.000>
      .replace(/<\d{1,3}:\d{2}:\d{2}[.,]\d{1,3}>/g, '')
      // Styling and voice tags: <i>, </i>, <c.colorE5E5E5>, <v Speaker>
      .replace(/<\/?[a-zA-Z][^>]*>/g, '')
      // Entities WebVTT escapes.
      .replace(/&lrm;|&rlm;/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, ' ')
      .trim()
  );
}

function detectFormat(text: string): CaptionFormat {
  return /^﻿?WEBVTT/.test(text) ? 'vtt' : 'srt';
}

/**
 * A WebVTT block starting with `NOTE`, `STYLE` or `REGION` is not a cue — it
 * is metadata, and everything in it must be ignored.
 */
const IGNORED_BLOCKS = /^(NOTE|STYLE|REGION)\b/;

/** A block starts at the timing line, or at a numeric index just before it. */
function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i];
  if (line === undefined) return false;
  if (line.includes('-->')) return true;
  return /^\d+$/.test(line.trim()) && (lines[i + 1]?.includes('-->') ?? false);
}

/**
 * Block separator. YouTube's auto-generated captions put a line containing a
 * single space *inside* the cue (where the rolling text goes), so whitespace
 * alone only ends a block when what follows is really a new cue.
 */
function isSeparator(lines: string[], i: number): boolean {
  const line = lines[i];
  if (line === undefined) return true;
  if (line === '') return true;
  return line.trim() === '' && startsBlock(lines, i + 1);
}

export function parseCaptions(raw: string): ParsedCaptions {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new CaptionParseError(
      'a legenda está vazia — cole o conteúdo de um arquivo .srt ou .vtt',
    );
  }

  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const format = detectFormat(text);
  const lines = text.split('\n');

  const cues: Cue[] = [];
  let i = 0;
  // The VTT header (`WEBVTT ...` plus metadata) runs until the first blank line.
  if (format === 'vtt') {
    while (i < lines.length && !isSeparator(lines, i)) i++;
  }

  while (i < lines.length) {
    // Skip blank lines between blocks.
    if (lines[i].trim() === '') {
      i++;
      continue;
    }

    const blockStart = i;

    if (format === 'vtt' && IGNORED_BLOCKS.test(lines[i].trim())) {
      while (i < lines.length && !isSeparator(lines, i)) i++;
      continue;
    }

    // Optional numeric index (required in SRT, rare in VTT).
    if (/^\d+$/.test(lines[i].trim()) && lines[i + 1] !== undefined) {
      i++;
    } else if (format === 'vtt' && !lines[i].includes('-->') && lines[i + 1]?.includes('-->')) {
      // Textual cue identifier in VTT.
      i++;
    }

    const timingLine = lines[i];
    if (timingLine === undefined || !timingLine.includes('-->')) {
      throw new CaptionParseError(
        `esperava um timestamp (00:00:00${format === 'srt' ? ',' : '.'}000 --> ...), encontrei "${(lines[blockStart] ?? '').trim()}"`,
        blockStart + 1,
      );
    }

    const timing = CUE_TIMING_LINE.exec(timingLine.trim());
    if (!timing) {
      throw new CaptionParseError(`linha de tempo malformada: "${timingLine.trim()}"`, i + 1);
    }

    const startMs = parseTimestamp(timing[1], i + 1);
    const endMs = parseTimestamp(timing[2], i + 1);
    i++;

    const body: string[] = [];
    while (i < lines.length && !isSeparator(lines, i)) {
      body.push(lines[i]);
      i++;
    }

    const rawBody = body.join('\n');
    const cueText = stripInlineTags(rawBody).replace(/\n+/g, ' ').trim();
    if (cueText === '') continue; // Empty cue: positioning or an artifact, not an error.

    const speechEndMs = lastInlineTimestamp(rawBody);

    cues.push({
      id: `c${cues.length}`,
      startMs,
      endMs: Math.max(endMs, startMs),
      text: cueText,
      ...(speechEndMs !== undefined && speechEndMs >= startMs ? { speechEndMs } : {}),
    });
  }

  if (cues.length === 0) {
    throw new CaptionParseError(
      'não encontrei nenhuma legenda com timestamp — confira se colou o arquivo inteiro',
    );
  }

  cues.sort((a, b) => a.startMs - b.startMs);
  return { cues: cues.map((cue, index) => ({ ...cue, id: `c${index}` })), format };
}
