/**
 * Core domain contracts (PLAN.md §Contratos).
 *
 * Rule: `segmenter`, `normalize` and `diff` know nothing about React, YouTube
 * or the DOM. Data in, data out.
 */

/** One caption line, as it came from the source (yt-dlp, pasted SRT/VTT). */
export type Cue = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  /**
   * When the last word of the cue *starts*, from the word-level timings the
   * ASR track inlines (`<00:00:01.000>`). A cue can stay on screen long after
   * the speech ends — this is what tells the two apart. Absent on manual
   * captions, which carry no inline timings.
   */
  speechEndMs?: number;
};

/** A practiceable chunk: what the player plays and what you have to type. */
export type Segment = {
  index: number;
  startMs: number;
  endMs: number;
  referenceText: string;
  /** Cues this segment was built from — for diagnostics only. */
  sourceCueIds: string[];
};

export type TokenStatus = 'correct' | 'typo' | 'wrong' | 'missing' | 'extra';

export type DiffToken = {
  /** What to render on screen for this token. */
  text: string;
  status: TokenStatus;
  /** Set when `status` is 'typo' or 'wrong': the reference word. */
  expected?: string;
};

export type DiffResult = {
  tokens: DiffToken[];
  /** 0..1 — correct tokens (a typo counts as 0.5) over reference tokens. */
  accuracy: number;
};

export type CorrectionMode = 'lenient' | 'strict';

export type CaptionFormat = 'srt' | 'vtt';

export type CaptionKind = 'manual' | 'asr';
