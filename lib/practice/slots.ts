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

export type Slot = {
  char: string;
  kind: SlotKind;
  /** For typed and overflow slots: which character of the typed word it is. */
  source?: number;
};

export type WordSlots = {
  /** `null` for words typed past the end of the reference. */
  reference: string | null;
  slots: Slot[];
  state: 'pending' | 'current' | 'done';
  /** How a finished word compares with its reference word. */
  status?: TokenStatus;
  /**
   * Part of a hyphenated word that carries on into the next one
   * (`once-` of `once-in-a-lifetime`) — drawn without a gap after it.
   */
  joined: boolean;
  /** Where the caret is drawn — before this slot (`slots.length`: after the last). */
  caret?: number;
  /**
   * A finished word the caret was moved back into: shown as being typed again,
   * ungraded, until the caret leaves it.
   */
  reopened?: boolean;
};

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const APOSTROPHES = /[’‘‛`´]/g;

const isLetterOrDigit = (char: string) => LETTER_OR_DIGIT.test(char);

/** A hyphen between letters: `once-in-a-lifetime` splits after each one. */
const HYPHEN_JOIN = /(?<=[\p{L}\p{N}]-+)(?=[\p{L}\p{N}])/u;

/**
 * Reference words, with hyphenated ones cut into parts that keep their
 * hyphen — `once-in-a-lifetime` is four blanks-groups, not one. The sentence
 * check already reads `once-in` and `once in` as the same; the slots must too,
 * or typing it with spaces shifts every word after it.
 */
function referenceWords(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => word.split(HYPHEN_JOIN));
}

/** Whether the last typed word has been closed, by a space or a hyphen. */
const closesWord = (text: string) => /[\s-]$/.test(text);

const letterCount = (word: string) => [...word].filter(isLetterOrDigit).length;

/** The part of a hyphenated word that carries on into the next one. */
const isJoined = (word: string) => word.endsWith('-');

type Piece = { text: string; start: number };

/**
 * Typed text cut into one piece per reference word. A space or a hyphen ends
 * a piece — and so does filling every blank of a hyphenated part: inside
 * `once-in-a-lifetime` the letters carry on into the next part by themselves,
 * so `onceinalifetime`, `once in a lifetime` and `once-in-a-lifetime` all
 * land the same way.
 *
 * `open` says whether the last piece is still being typed.
 */
function typedPieces(expected: string[], typed: string): { pieces: Piece[]; open: boolean } {
  const pieces: Piece[] = [];

  for (const match of typed.matchAll(/[^\s-]+/g)) {
    let text = match[0];
    let start = match.index;

    for (;;) {
      const word = expected[pieces.length];
      const room = word !== undefined && isJoined(word) ? letterCount(word) : Infinity;
      if (letterCount(text) <= room) break;

      // Cut right after the letter that fills the part's last blank.
      let cut = 0;
      for (let seen = 0; seen < room; cut++) if (isLetterOrDigit(text[cut])) seen++;
      pieces.push({ text: text.slice(0, cut), start });
      text = text.slice(cut);
      start += cut;
    }

    pieces.push({ text, start });
  }

  const at = pieces.length - 1;
  const word = expected[at];
  const filled = word !== undefined && isJoined(word) && letterCount(pieces[at].text) >= letterCount(word);
  return { pieces, open: pieces.length > 0 && !closesWord(typed) && !filled };
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
      slots.push({ char: typedChars[t], kind: 'typed', source: t });
      t++;
    } else {
      slots.push({ char: '_', kind: 'empty' });
    }
  }

  for (; t < typedChars.length; t++) {
    const char = typedChars[t];
    if (isLetterOrDigit(char)) slots.push({ char, kind: 'overflow', source: t });
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

/** Caret at the end of a word: on its first blank, or after its last letter when full. */
function endCaret(slots: Slot[]): number {
  const firstEmpty = slots.findIndex((slot) => slot.kind === 'empty');
  return firstEmpty === -1 ? slots.length : firstEmpty;
}

/**
 * Which piece a caret `offset` into the typed text falls in, and where inside
 * it. On the seam between two parts typed together, the later one wins — the
 * caret sits before the letter that follows it. Between words, it goes to the
 * start of the next one.
 */
function locateCaret(pieces: Piece[], offset: number): { index: number; local: number } | null {
  for (let index = pieces.length - 1; index >= 0; index--) {
    const { start, text } = pieces[index];
    if (start <= offset && offset <= start + text.length) return { index, local: offset - start };
  }
  const next = pieces.findIndex((piece) => piece.start > offset);
  return next === -1 ? null : { index: next, local: 0 };
}

/**
 * @param caret where the textarea's caret is, as an offset into `typed`.
 *   At the end (the default) it is drawn on the word being typed.
 */
export function slotWords(
  reference: string,
  typed: string,
  mode: CorrectionMode = 'lenient',
  caret: number = typed.length,
): WordSlots[] {
  const expected = referenceWords(reference);
  const { pieces, open } = typedPieces(expected, typed);
  const got = pieces.map((piece) => piece.text);
  // The last word is still being typed until a space (or hyphen) closes it.
  const finished = open ? got.length - 1 : got.length;
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
      joined: isJoined(word),
    };
  });

  for (let index = expected.length; index < got.length; index++) {
    result.push({
      reference: null,
      slots: [...got[index]].map((char, source) => ({ char, kind: 'overflow' as const, source })),
      state: index < finished ? 'done' : 'current',
      status: index < finished ? 'extra' : undefined,
      joined: false,
    });
  }

  // Moved back with the arrows or the mouse: draw it where it really is.
  const at = caret < typed.length ? locateCaret(pieces, caret) : null;
  if (at !== null) {
    const word = result[at.index];
    const before = word.slots.findIndex((slot) => slot.source !== undefined && slot.source >= at.local);
    word.caret = before === -1 ? endCaret(word.slots) : before;
    // The space after it was typed before: it is not done until you leave it.
    if (word.state === 'done') {
      word.state = 'current';
      word.status = undefined;
      word.reopened = true;
    }
  } else {
    const word = result[current];
    if (word !== undefined && word.state === 'current') word.caret = endCaret(word.slots);
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
  const expected = referenceWords(reference);
  const { pieces, open } = typedPieces(expected, typed);
  const index = open ? pieces.length - 1 : pieces.length;
  const word = expected[index];
  if (word === undefined) return typed;

  const prefix = open ? typed.slice(0, pieces[index].start) : typed;
  // No space needed where the previous part of a hyphenated word left off.
  const glued = index > 0 && isJoined(expected[index - 1]);
  const gap = prefix === '' || closesWord(prefix) || glued ? '' : ' ';
  // A hyphenated part already closes itself with its hyphen.
  return `${prefix}${gap}${word}${isJoined(word) ? '' : ' '}`;
}

/**
 * `typed` with a space wherever letters ran on from one part of a hyphenated
 * word into the next (`onceinalifetime` → `once in a lifetime`), so the
 * sentence check on Enter agrees with what the slots showed. Anything else is
 * left exactly as typed.
 */
export function separateJoinedParts(reference: string, typed: string): string {
  const { pieces } = typedPieces(referenceWords(reference), typed);
  let result = typed;
  for (let index = pieces.length - 1; index > 0; index--) {
    const { start } = pieces[index];
    const previous = pieces[index - 1];
    if (previous.start + previous.text.length === start) {
      result = `${result.slice(0, start)} ${result.slice(start)}`;
    }
  }
  return result;
}
