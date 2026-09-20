/**
 * RF-03 — turns irregular cues into practiceable segments.
 *
 * Raw captions arrive in arbitrary chunks (sometimes a stray word, sometimes a
 * whole sentence). The segmenter regroups them into 3–8s pieces of up to ~15
 * words, preferring to break where the speech actually pauses.
 *
 * No React, no DOM, no network: `Cue[]` in, `Segment[]` out.
 */

import type { Cue, Segment } from '@/types';

export type SegmentOptions = {
  /** Below this a segment is too short to practise. */
  minMs?: number;
  /** Target floor: only past this is it worth looking for a break. */
  targetMinMs?: number;
  /** Hard duration cap. */
  maxMs?: number;
  /** Hard word cap. */
  maxWords?: number;
  /** Silence between cues that counts as a natural pause. */
  silenceGapMs?: number;
  /** Strip `[Music]`, `>>`, `NAME:` and friends. */
  stripNonSpeech?: boolean;
};

const DEFAULTS: Required<SegmentOptions> = {
  minMs: 1500,
  targetMinMs: 3000,
  maxMs: 8000,
  maxWords: 15,
  silenceGapMs: 700,
  stripNonSpeech: true,
};

// ---------------------------------------------------------------- cleanup

/** `[Music]`, `[Applause]`, `[Laughter]`, `[ __ ]`… — YouTube's convention. */
const BRACKETS = /\[[^\]]*\]/g;
/** A whole cue in parentheses is a sound annotation: `(baaaah!!)`. */
const ONLY_PARENTHESES = /^\([^)]*\)$/;
/** Speaker-change marker. */
const CHEVRONS = /^>>+\s*/;
/** Upper-case speaker label: `JOHN:`, `NARRATOR:`, `DR. SMITH:`. */
const SPEAKER_LABEL = /^[A-Z][A-Z0-9 .'’-]{1,24}:\s*/;
/** Music lines: ♪ … ♪ */
const MUSIC_NOTES = /[♪♫]/g;

export function stripNonSpeech(text: string): string {
  let result = text.replace(BRACKETS, ' ');
  if (MUSIC_NOTES.test(result)) result = result.replace(MUSIC_NOTES, ' ');
  result = result.replace(CHEVRONS, '');
  result = result.replace(SPEAKER_LABEL, '');
  result = result.trim();
  if (ONLY_PARENTHESES.test(result)) return '';
  return result.replace(/\s+/g, ' ').trim();
}

/** Comparable form of a word — only to spot repetition, never for the diff. */
function key(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
}

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

export function countWords(text: string): number {
  return words(text).length;
}

/**
 * Removes the *rolling text* of auto-generated captions: YouTube repeats the
 * previous line at the start of the next cue.
 *
 * The trim needs at least 3 overlapping words, because a short repeat is real
 * speech — "have really… really really long trunks" must survive intact.
 */
const MIN_OVERLAP = 3;

function dropRepeatedPrefix(previous: string, current: string): string {
  const previousKeys = words(previous).map(key);
  const currentWords = words(current);
  const currentKeys = currentWords.map(key);
  const longest = Math.min(previousKeys.length, currentWords.length);

  for (let k = longest; k >= 1; k--) {
    const matches = previousKeys
      .slice(previousKeys.length - k)
      .every((word, index) => word === currentKeys[index]);
    if (!matches) continue;
    // The whole cue already appeared: it is the ASR's 10ms ghost cue.
    if (k === currentWords.length) return '';
    if (k >= MIN_OVERLAP) return currentWords.slice(k).join(' ');
    return current;
  }

  return current;
}

export function cleanCues(cues: Cue[], options: Required<SegmentOptions>): Cue[] {
  const kept: Cue[] = [];

  for (const cue of cues) {
    const text = options.stripNonSpeech ? stripNonSpeech(cue.text) : cue.text.trim();
    if (text === '') continue;

    const previous = kept[kept.length - 1];
    const deduped = previous ? dropRepeatedPrefix(previous.text, text) : text;
    if (deduped === '') continue;

    kept.push({ ...cue, text: deduped });
  }

  return kept;
}

// ----------------------------------------------------------- segmentation

const SENTENCE_END = /[.!?]["'”’)\]]*$/;
const WEAK_PUNCTUATION = /[,;:—–-]["'”’)\]]*$/;

type Pending = { cues: Cue[]; startMs: number; endMs: number; text: string };

function close(pending: Pending, index: number): Segment {
  return {
    index,
    startMs: pending.startMs,
    endMs: pending.endMs,
    referenceText: pending.text,
    sourceCueIds: pending.cues.map((cue) => cue.id),
  };
}

export function segment(cues: Cue[], options: SegmentOptions = {}): Segment[] {
  const opts = { ...DEFAULTS, ...options };
  const cleaned = cleanCues(cues, opts);
  if (cleaned.length === 0) return [];

  const segments: Segment[] = [];
  let pending: Pending | null = null;

  const emit = () => {
    if (!pending) return;
    segments.push(close(pending, segments.length));
    pending = null;
  };

  for (let i = 0; i < cleaned.length; i++) {
    const cue = cleaned[i];
    const next = cleaned[i + 1];

    if (pending === null) {
      pending = { cues: [cue], startMs: cue.startMs, endMs: cue.endMs, text: cue.text };
    } else {
      const candidateDuration = cue.endMs - pending.startMs;
      const candidateWords = countWords(`${pending.text} ${cue.text}`);
      const wouldOverflow = candidateWords > opts.maxWords || candidateDuration > opts.maxMs;

      if (wouldOverflow) {
        emit();
        pending = { cues: [cue], startMs: cue.startMs, endMs: cue.endMs, text: cue.text };
      } else {
        pending = {
          cues: [...pending.cues, cue],
          startMs: pending.startMs,
          endMs: cue.endMs,
          text: `${pending.text} ${cue.text}`,
        };
      }
    }

    const duration = pending.endMs - pending.startMs;
    const totalWords = countWords(pending.text);
    const gap = next ? next.startMs - pending.endMs : Infinity;

    // Hard caps first: past them there is no choice.
    if (totalWords >= opts.maxWords || duration >= opts.maxMs) {
      emit();
      continue;
    }

    if (duration < opts.targetMinMs) continue;

    // Within target: look for the best break, in the order the spec lists.
    if (SENTENCE_END.test(pending.text)) {
      emit();
    } else if (gap >= opts.silenceGapMs) {
      emit();
    } else if (
      WEAK_PUNCTUATION.test(pending.text) &&
      duration >= (opts.targetMinMs + opts.maxMs) / 2
    ) {
      emit();
    }
  }

  emit();
  return mergeTrailingScrap(segments, opts);
}

/**
 * The last segment tends to be whatever was left over. Half a second is not
 * practiceable, so it goes back into the previous segment even if that pushes
 * it a little past the word target.
 */
function mergeTrailingScrap(segments: Segment[], options: Required<SegmentOptions>): Segment[] {
  if (segments.length < 2) return segments;

  const last = segments[segments.length - 1];
  if (last.endMs - last.startMs >= options.minMs) return segments;

  const previous = segments[segments.length - 2];
  const mergedText = `${previous.referenceText} ${last.referenceText}`;
  if (countWords(mergedText) > options.maxWords + 5) return segments;

  const merged: Segment = {
    index: previous.index,
    startMs: previous.startMs,
    endMs: last.endMs,
    referenceText: mergedText,
    sourceCueIds: [...previous.sourceCueIds, ...last.sourceCueIds],
  };

  return [...segments.slice(0, -2), merged];
}
