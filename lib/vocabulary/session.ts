/**
 * One vocabulary run: the chosen words in random order, each shown once.
 * It ends when the queue runs out or you stop; the summary only counts the
 * words you actually answered.
 */

import type { Verdict } from '@/lib/vocabulary/check';
import type { Word } from '@/lib/vocabulary/words';

export const ALL_CATEGORIES = 'all';

export type VocabAnswer = { word: Word; typed: string; verdict: Verdict };

export type VocabSession = {
  queue: Word[];
  index: number;
  answers: VocabAnswer[];
  stopped: boolean;
};

export type VocabSummary = { right: number; wrong: number; missed: VocabAnswer[] };

/** Fisher–Yates, with the random source injectable for tests. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function wordsIn(words: readonly Word[], category: string): Word[] {
  return category === ALL_CATEGORIES ? [...words] : words.filter((word) => word.category === category);
}

export function startVocabSession(words: readonly Word[], random?: () => number): VocabSession {
  return { queue: shuffle(words, random), index: 0, answers: [], stopped: false };
}

export function currentWord(session: VocabSession): Word | null {
  return isFinished(session) ? null : (session.queue[session.index] ?? null);
}

/** Whether the word on screen already has an answer and is waiting for "next". */
export function isAnswered(session: VocabSession): boolean {
  return session.answers.length > session.index;
}

export function answerWord(session: VocabSession, typed: string, verdict: Verdict): VocabSession {
  const word = currentWord(session);
  if (word === null || isAnswered(session)) return session;
  return { ...session, answers: [...session.answers, { word, typed, verdict }] };
}

export function nextWord(session: VocabSession): VocabSession {
  if (!isAnswered(session)) return session;
  return { ...session, index: session.index + 1 };
}

export function stopSession(session: VocabSession): VocabSession {
  return { ...session, stopped: true };
}

export function isFinished(session: VocabSession): boolean {
  return session.stopped || session.index >= session.queue.length;
}

export function summarize(session: VocabSession): VocabSummary {
  const missed = session.answers.filter((answer) => answer.verdict !== 'right');
  return { right: session.answers.length - missed.length, wrong: missed.length, missed };
}
