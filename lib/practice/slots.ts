/**
 * POC — the "word slots" hint: every reference word drawn as one blank per
 * letter (`_ _ _ _`), filled in as you type. Knowing how many words there are
 * and how long each one is turns a blind guess into a prediction — enough of a
 * nudge to unstick a hard segment without giving the words away.
 *
 * Positional on purpose: typed word N fills reference word N. The slots tell
 * you the word count, so skipping a word is the exception, not the rule — and
 * the sentence-level `compare` on Enter still aligns properly either way.
 *
 * No React, no DOM: text in, slots out.
 */

import { compare, isPerfect } from '@/lib/correction/diff';
import type { CorrectionMode, TokenStatus } from '@/types';

export type SlotKind =
  /** A letter you typed, sitting in its blank. */
  | 'typed'
  /** A blank still waiting for a letter. */
  | 'empty'
  /** Punctuation from the reference (`'` in `don't`), shown as-is. */
  | 'fixed'
  /** Letters typed past the end of the word. */
  | 'overflow';

export type Slot = { char: string; kind: SlotKind };

export type WordSlots = {
  /** `null` for words typed past the end of the reference. */
  reference: string | null;
  slots: Slot[];
  state: 'pending' | 'current' | 'done';
  /** How a finished word compares with its reference word. */
  status?: TokenStatus;
};

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const APOSTROPHES = /[’‘‛`´]/g;

const isLetterOrDigit = (char: string) => LETTER_OR_DIGIT.test(char);

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * Pours one typed word into one reference word's blanks. Punctuation is never
 * a blank to fill: typed punctuation that matches the reference is consumed,
 * anything else is skipped, so `dont` and `don't` fill `don't` alike.
 */
export function fillWord(reference: string, typed: string): Slot[] {
  const typedChars = [...typed.replace(APOSTROPHES, "'")];
  const slots: Slot[] = [];
  let t = 0;

  for (const char of reference.replace(APOSTROPHES, "'")) {
    if (!isLetterOrDigit(char)) {
      if (typedChars[t] === char) t++;
      slots.push({ char, kind: 'fixed' });
      continue;
    }

    while (t < typedChars.length && !isLetterOrDigit(typedChars[t])) t++;
    if (t < typedChars.length) {
      slots.push({ char: typedChars[t], kind: 'typed' });
      t++;
    } else {
      slots.push({ char: '_', kind: 'empty' });
    }
  }

  for (const char of typedChars.slice(t)) {
    if (isLetterOrDigit(char)) slots.push({ char, kind: 'overflow' });
  }

  return slots;
}

/** One finished word against its reference, with the same leniency as Enter. */
export function wordStatus(reference: string, typed: string, mode: CorrectionMode): TokenStatus {
  const result = compare(reference, typed, mode);
  if (isPerfect(result)) return 'correct';
  return result.tokens.every((token) => token.status === 'correct' || token.status === 'typo')
    ? 'typo'
    : 'wrong';
}

export function slotWords(
  reference: string,
  typed: string,
  mode: CorrectionMode = 'lenient',
): WordSlots[] {
  const expected = words(reference);
  const got = words(typed);
  // The last word is still being typed until a space closes it.
  const finished = /\s$/.test(typed) ? got.length : got.length - 1;
  const current = Math.max(finished, 0);

  // No space comes after the last word — Enter does. So the last word closes
  // as soon as it is right or has no blanks left, and is graded like the
  // rest, instead of sitting there looking unfinished.
  const last = expected.length - 1;
  const lastIsComplete =
    finished === last &&
    got.length === expected.length &&
    (wordStatus(expected[last], got[last], mode) === 'correct' ||
      fillWord(expected[last], got[last]).every((slot) => slot.kind !== 'empty'));

  const result: WordSlots[] = expected.map((word, index) => {
    const typedWord = got[index] ?? '';
    const state =
      index < finished || (index === last && lastIsComplete)
        ? 'done'
        : index === current
          ? 'current'
          : 'pending';
    return {
      reference: word,
      slots: fillWord(word, typedWord),
      state,
      status: state === 'done' ? wordStatus(word, typedWord, mode) : undefined,
    };
  });

  for (let index = expected.length; index < got.length; index++) {
    result.push({
      reference: null,
      slots: [...got[index]].map((char) => ({ char, kind: 'overflow' as const })),
      state: index < finished ? 'done' : 'current',
      status: index < finished ? 'extra' : undefined,
    });
  }

  return result;
}

/**
 * The "just this one word" hint: the word being typed — or the next one, if
 * the last was closed with a space — swapped for the reference word, plus the
 * space that closes it, so you carry on typing from the word after.
 *
 * Same positional rule as `slotWords`: typed word N stands for reference word
 * N. Past the last reference word there is nothing to give, so `typed` comes
 * back untouched.
 */
export function revealNextWord(reference: string, typed: string): string {
  const prefix = typed.replace(/\S+$/, '');
  const word = words(reference)[words(prefix).length];
  if (word === undefined) return typed;
  const gap = prefix === '' || /\s$/.test(prefix) ? '' : ' ';
  return `${prefix}${gap}${word} `;
}
