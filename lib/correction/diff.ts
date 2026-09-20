/**
 * SPEC §RF-05 — word-by-word alignment between the caption and what was typed.
 *
 * Needleman-Wunsch style dynamic programming over the canonical tokens (§5):
 * a match costs 0, a keyboard slip costs 0.5, a wrong word costs 1, and a
 * missing/extra word costs 1. The cheapest path becomes the markup.
 *
 * No React, no DOM: text in, `DiffResult` out.
 */

import { canonicalize, tokensMatch, type Token } from '@/lib/correction/normalize';
import type { CorrectionMode, DiffResult, DiffToken } from '@/types';

/**
 * A short word with one letter changed is a different word — `is`/`it`,
 * `can`/`man`. Getting those wrong is a listening miss, not a typo, so typos
 * only start at 4 letters.
 */
const SHORTEST_TYPO_WORD = 4;

/**
 * Optimal string alignment distance: Levenshtein plus transposition.
 *
 * The spec says Levenshtein, but its intent is "I slipped on the keyboard" —
 * and swapping two letters (`thing` → `thnig`) is the single most common slip.
 * Plain Levenshtein scores that as 2 edits and would call it a wrong word.
 *
 * Bails out as soon as the whole row is past `limit`, returning `limit + 1`.
 */
export function editDistance(a: string, b: string, limit = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;

  let beforePrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let bestInRow = i;

    for (let j = 1; j <= b.length; j++) {
      const substitution = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitution,
      );

      const transposed =
        i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1];
      if (transposed) value = Math.min(value, beforePrevious[j - 2] + 1);

      current.push(value);
      bestInRow = Math.min(bestInRow, value);
    }

    if (bestInRow > limit) return limit + 1;
    beforePrevious = previous;
    previous = current;
  }

  return previous[b.length];
}

/** §5 — at most 1 edit up to 5 letters, at most 2 above that. */
export function isTypo(reference: Token, typed: Token): boolean {
  const a = reference.canonical;
  const b = typed.canonical;
  if (a.length < SHORTEST_TYPO_WORD || b.length < SHORTEST_TYPO_WORD) return false;
  // Numbers are digits: `21` and `24` are not "almost the same word".
  if (/\d/.test(a) || /\d/.test(b)) return false;

  const limit = a.length <= 5 ? 1 : 2;
  return editDistance(a, b, limit) <= limit;
}

const COST_MATCH = 0;
const COST_TYPO = 0.5;
const COST_SUBSTITUTION = 1;
const COST_GAP = 1;

type Move = 'align' | 'missing' | 'extra';

function pairCost(reference: Token, typed: Token): number {
  if (tokensMatch(reference, typed)) return COST_MATCH;
  if (isTypo(reference, typed)) return COST_TYPO;
  return COST_SUBSTITUTION;
}

/**
 * Compares the caption against what was typed.
 *
 * `accuracy` is measured against the reference: correct tokens (a typo counts
 * as half) over the total expected. Extra words do not reduce it — they show
 * up marked, but they must not push the number below zero.
 */
export function compare(
  reference: string,
  typed: string,
  mode: CorrectionMode = 'lenient',
): DiffResult {
  const ref = canonicalize(reference, mode);
  const got = canonicalize(typed, mode);

  const n = ref.length;
  const m = got.length;

  // cost[i][j] = best cost to align ref[i..] with got[j..]
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const move: Move[][] = Array.from({ length: n + 1 }, () => new Array<Move>(m + 1).fill('align'));

  for (let i = n - 1; i >= 0; i--) {
    cost[i][m] = cost[i + 1][m] + COST_GAP;
    move[i][m] = 'missing';
  }
  for (let j = m - 1; j >= 0; j--) {
    cost[n][j] = cost[n][j + 1] + COST_GAP;
    move[n][j] = 'extra';
  }

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const align = cost[i + 1][j + 1] + pairCost(ref[i], got[j]);
      const missing = cost[i + 1][j] + COST_GAP;
      const extra = cost[i][j + 1] + COST_GAP;

      const best = Math.min(align, missing, extra);
      cost[i][j] = best;
      // Ties go to aligning: it keeps the sentence side by side.
      move[i][j] = best === align ? 'align' : best === missing ? 'missing' : 'extra';
    }
  }

  const tokens: DiffToken[] = [];
  let score = 0;
  let i = 0;
  let j = 0;

  while (i < n || j < m) {
    const step: Move = i === n ? 'extra' : j === m ? 'missing' : move[i][j];

    if (step === 'missing') {
      tokens.push({ text: ref[i].surface, status: 'missing' });
      i++;
      continue;
    }

    if (step === 'extra') {
      tokens.push({ text: got[j].surface, status: 'extra' });
      j++;
      continue;
    }

    const expected = ref[i];
    const actual = got[j];

    if (tokensMatch(expected, actual)) {
      tokens.push({ text: expected.surface, status: 'correct' });
      score += 1;
    } else if (isTypo(expected, actual)) {
      tokens.push({ text: actual.surface, status: 'typo', expected: expected.surface });
      score += 0.5;
    } else {
      tokens.push({ text: actual.surface, status: 'wrong', expected: expected.surface });
    }

    i++;
    j++;
  }

  const accuracy = n === 0 ? (m === 0 ? 1 : 0) : Math.max(0, Math.min(1, score / n));

  return { tokens, accuracy };
}

/** Shortcut for the UI: everything right? (§RF-05 auto-advances when so) */
export function isPerfect(result: DiffResult): boolean {
  return result.tokens.every((token) => token.status === 'correct');
}

/**
 * POC — live per-word feedback while typing, without touching sentence-level
 * scoring: `check()` in the practice screen still only runs on Enter, using
 * `compare` above unchanged.
 *
 * Reuses the same alignment, but only over words the user has actually
 * finished (space-terminated) — the word still being typed is excluded, and
 * the unreached reference tail is trimmed off so it doesn't read as an error.
 */
export function liveCompare(
  reference: string,
  typed: string,
  mode: CorrectionMode = 'lenient',
): DiffToken[] {
  const endsWithSpace = /\s$/.test(typed);
  const words = typed.trim().split(/\s+/).filter(Boolean);
  const completedWords = endsWithSpace ? words : words.slice(0, -1);
  if (completedWords.length === 0) return [];

  const { tokens } = compare(reference, completedWords.join(' '), mode);

  let end = tokens.length;
  while (end > 0 && tokens[end - 1].status === 'missing') end--;
  return tokens.slice(0, end);
}

/**
 * Reference words that failed — feeds the "problem words" list of §RF-08.
 * Typos are left out: the ear got it right.
 */
export function missedWords(result: DiffResult): string[] {
  return result.tokens
    .filter((token) => token.status === 'wrong' || token.status === 'missing')
    .map((token) => (token.status === 'wrong' ? (token.expected ?? token.text) : token.text))
    .map((word) => word.toLowerCase())
    .filter(Boolean);
}
