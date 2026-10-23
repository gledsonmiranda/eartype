/**
 * Is the typed answer the English word? Lenient about everything that is not
 * spelling — case, edge spaces, a leading article, an accepted synonym — and
 * strict about spelling itself: a one-letter slip is shown as "almost" so you
 * see how close you were, but it still counts as a miss.
 *
 * Spoken answers go through the same rules: the recognizer hands back a few
 * guesses at what it heard, and the best-scoring one is the answer.
 */

import { editDistance } from '@/lib/correction/diff';
import type { Word } from '@/lib/vocabulary/words';

export type Verdict = 'right' | 'almost' | 'wrong';

/** Below this many letters, one edit is a different word (`cat` → `cap`). */
const SHORTEST_ALMOST = 4;

const ARTICLE = /^(?:a|an|the)\s+/;

/** Recognizers punctuate (`Fridge.`); nobody types a full stop after one word either. */
const EDGE_PUNCTUATION = /^[\s.,!?;:"]+|[\s.,!?;:"]+$/g;

export function normalizeAnswer(text: string): string {
  return text
    .replace(/[’‘`´]/g, "'")
    .replace(EDGE_PUNCTUATION, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(ARTICLE, '');
}

export function acceptedAnswers(word: Pick<Word, 'english' | 'alternatives'>): string[] {
  return [...new Set([word.english, ...word.alternatives].map(normalizeAnswer).filter(Boolean))];
}

export function checkAnswer(word: Pick<Word, 'english' | 'alternatives'>, typed: string): Verdict {
  const answer = normalizeAnswer(typed);
  if (answer === '') return 'wrong';

  const accepted = acceptedAnswers(word);
  if (accepted.includes(answer)) return 'right';

  const close = accepted.some(
    (form) => form.length >= SHORTEST_ALMOST && editDistance(form, answer, 1) <= 1,
  );
  return close ? 'almost' : 'wrong';
}

const RANK: Record<Verdict, number> = { right: 0, almost: 1, wrong: 2 };

/**
 * The recognizer's guesses, best first. The answer is the guess that scores
 * best — if any of them is the word, you said the word — and on a tie, the
 * recognizer's own favorite.
 */
export function checkSpoken(
  word: Pick<Word, 'english' | 'alternatives'>,
  guesses: readonly string[],
): { verdict: Verdict; heard: string } {
  let best: { verdict: Verdict; heard: string } = { verdict: 'wrong', heard: guesses[0]?.trim() ?? '' };
  for (const guess of guesses) {
    const verdict = checkAnswer(word, guess);
    if (RANK[verdict] < RANK[best.verdict]) best = { verdict, heard: guess.trim() };
  }
  return best;
}
