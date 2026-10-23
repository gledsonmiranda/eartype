/**
 * Is the typed answer the English word? Lenient about everything that is not
 * spelling — case, edge spaces, a leading article, an accepted synonym — and
 * strict about spelling itself: a one-letter slip is shown as "almost" so you
 * see how close you were, but it still counts as a miss.
 *
 * A spoken answer lands in the same field first, so it is checked like any
 * typed one — after you have seen it and confirmed it.
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

