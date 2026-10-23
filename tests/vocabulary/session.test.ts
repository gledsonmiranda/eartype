import { describe, expect, it } from 'vitest';
import {
  ALL_CATEGORIES,
  answerWord,
  currentWord,
  isAnswered,
  isFinished,
  nextWord,
  shuffle,
  startVocabSession,
  stopSession,
  summarize,
  wordsIn,
} from '@/lib/vocabulary/session';
import type { Word } from '@/lib/vocabulary/words';

function word(id: string, category = 'Cozinha'): Word {
  return {
    id,
    portuguese: `pt ${id}`,
    english: `en ${id}`,
    alternatives: [],
    category,
    builtIn: true,
    timesRight: 0,
    timesWrong: 0,
    lastSeen: null,
  };
}

const words = [word('a'), word('b'), word('c', 'Casa')];

describe('wordsIn', () => {
  it('filters by category, or keeps all', () => {
    expect(wordsIn(words, 'Casa').map((w) => w.id)).toEqual(['c']);
    expect(wordsIn(words, ALL_CATEGORIES)).toHaveLength(3);
  });
});

describe('shuffle', () => {
  it('keeps every item exactly once', () => {
    const shuffled = shuffle([1, 2, 3, 4, 5], () => 0.3);
    expect([...shuffled].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('a session', () => {
  it('shows every word once and then finishes', () => {
    let session = startVocabSession(words, () => 0);
    const seen: string[] = [];

    while (!isFinished(session)) {
      const current = currentWord(session)!;
      seen.push(current.id);
      session = answerWord(session, 'x', current.id === 'b' ? 'right' : 'wrong');
      session = nextWord(session);
    }

    expect([...seen].sort()).toEqual(['a', 'b', 'c']);
    expect(currentWord(session)).toBeNull();
    const summary = summarize(session);
    expect(summary.right).toBe(1);
    expect(summary.wrong).toBe(2);
    expect(summary.missed.map((answer) => answer.word.id).sort()).toEqual(['a', 'c']);
  });

  it('waits for an answer before moving on, and takes only one', () => {
    let session = startVocabSession(words);
    expect(nextWord(session)).toBe(session);

    session = answerWord(session, 'one', 'wrong');
    expect(isAnswered(session)).toBe(true);
    expect(answerWord(session, 'two', 'right')).toBe(session);
  });

  it('counts "almost" as a miss', () => {
    const session = answerWord(startVocabSession([word('a')]), 'x', 'almost');
    expect(summarize(session)).toMatchObject({ right: 0, wrong: 1 });
  });

  it('stops early with only what was answered', () => {
    let session = startVocabSession(words);
    session = nextWord(answerWord(session, 'x', 'right'));
    session = stopSession(session);

    expect(isFinished(session)).toBe(true);
    expect(summarize(session)).toMatchObject({ right: 1, wrong: 0, missed: [] });
  });
});
