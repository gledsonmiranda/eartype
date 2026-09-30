/**
 * The way back out: cues as an SRT file, for saving a session's captions to
 * the library. Only what SRT can carry survives — `speechEndMs` (ASR word
 * timings) is dropped, and the segmenter falls back to the cue end.
 */

import type { Cue } from '@/types';

/** `83_456` → `00:01:23,456`. */
export function formatSrtTime(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

export function cuesToSrt(cues: Cue[]): string {
  return cues
    .map(
      (cue, index) =>
        `${index + 1}\n${formatSrtTime(cue.startMs)} --> ${formatSrtTime(cue.endMs)}\n${cue.text.trim()}\n`,
    )
    .join('\n');
}
