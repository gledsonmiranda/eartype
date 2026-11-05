import { describe, expect, it } from 'vitest';
import {
  dailyMix,
  dailyQueue,
  hasPracticed,
  isFirm,
  isStale,
  mixSize,
  needsReview,
  parseSessionSize,
  progressOf,
  topicDeck,
} from '@/lib/vocabulary/daily';
import type { Word } from '@/lib/vocabulary/words';

const TODAY = '2026-11-05';
const YESTERDAY = '2026-11-04';
const LONG_AGO = '2026-10-01';

function word(id: string, right = 0, wrong = 0, lastSeen: string | null = null, category = 'Casa'): Word {
  return {
    id,
    portuguese: id,
    english: id,
    alternatives: [],
    category,
    builtIn: true,
    timesRight: right,
    timesWrong: wrong,
    lastSeen: right + wrong === 0 ? null : (lastSeen ?? YESTERDAY),
  };
}

function many(prefix: string, count: number, make: (id: string) => Word): Word[] {
  return Array.from({ length: count }, (_, index) => make(`${prefix}${index}`));
}

const ids = (words: readonly Word[]) => words.map((item) => item.id);

describe('what a word needs', () => {
  it('reviews a miss until rights outnumber wrongs', () => {
    expect(needsReview(word('a', 0, 1))).toBe(true);
    expect(needsReview(word('a', 1, 1))).toBe(true);
    expect(needsReview(word('a', 2, 1))).toBe(false);
    expect(needsReview(word('a'))).toBe(false);
  });

  it('calls a word firm once rights lead by three', () => {
    expect(isFirm(word('a', 2))).toBe(false);
    expect(isFirm(word('a', 3))).toBe(true);
    expect(isFirm(word('a', 4, 2))).toBe(false);
  });

  it('goes stale after more than seven days', () => {
    expect(isStale(word('a', 3, 0, '2026-10-29'), TODAY)).toBe(false);
    expect(isStale(word('a', 3, 0, '2026-10-28'), TODAY)).toBe(true);
    expect(isStale(word('a'), TODAY)).toBe(false);
  });

  it('counts progress so the parts add up', () => {
    expect(progressOf([word('a'), word('b', 3), word('c', 1), word('d', 0, 2)])).toEqual({
      firm: 1,
      learning: 2,
      fresh: 1,
      total: 4,
    });
  });

  it('knows a first visit', () => {
    expect(hasPracticed([word('a'), word('b')])).toBe(false);
    expect(hasPracticed([word('a'), word('b', 0, 1)])).toBe(true);
  });
});

describe('dailyMix', () => {
  const words = [
    ...many('r', 40, (id) => word(id, 0, 1)),
    ...many('s', 40, (id) => word(id, 5, 0, LONG_AGO)),
    ...many('f', 40, (id) => word(id)),
  ];

  it.each([
    [10, 4, 3, 3],
    [20, 8, 5, 7],
    [30, 12, 8, 10],
  ])('splits %i cards by priority when every group has plenty', (size, review, stale, fresh) => {
    const mix = dailyMix(words, size, TODAY);
    expect([mix.review.length, mix.stale.length, mix.fresh.length]).toEqual([review, stale, fresh]);
  });

  it('gives the room of a short group to the others', () => {
    const mix = dailyMix([word('r', 0, 1), ...many('s', 40, (id) => word(id, 5, 0, LONG_AGO))], 10, TODAY);
    expect(mix.review).toHaveLength(1);
    expect(mix.stale).toHaveLength(9);
    expect(mix.fresh).toHaveLength(0);
  });

  it('fills spare room with older words before new ones', () => {
    const mix = dailyMix([word('r', 0, 1), ...many('s', 4, (id) => word(id, 5, 0, LONG_AGO)), ...many('f', 40, (id) => word(id))], 10, TODAY);
    expect([mix.review.length, mix.stale.length, mix.fresh.length]).toEqual([1, 4, 5]);
  });

  it('lets new words take the room when nothing else is waiting', () => {
    const mix = dailyMix(many('f', 40, (id) => word(id)), 10, TODAY);
    expect(mix.fresh).toHaveLength(10);
  });

  it('leaves out words you know and saw recently', () => {
    expect(mixSize(dailyMix([word('a', 5, 0, YESTERDAY)], 10, TODAY))).toBe(0);
  });

  it('never puts a word in two groups', () => {
    const mix = dailyMix([word('a', 0, 2, LONG_AGO)], 10, TODAY);
    expect(ids(mix.review)).toEqual(['a']);
    expect(mix.stale).toHaveLength(0);
  });

  it('puts the words you miss most first', () => {
    const mix = dailyMix([word('once', 0, 1), word('often', 0, 5)], 10, TODAY);
    expect(ids(mix.review)).toEqual(['often', 'once']);
  });

  it('starts a first visit with the shortest category', () => {
    const mix = dailyMix([...many('a', 5, (id) => word(id, 0, 0, null, 'Long')), ...many('b', 2, (id) => word(id, 0, 0, null, 'Short'))], 3, TODAY);
    expect(ids(mix.fresh)).toEqual(['b0', 'b1', 'a0']);
  });

  it('continues the category furthest along', () => {
    const mix = dailyMix([word('a', 5, 0, YESTERDAY, 'Started'), word('b', 0, 0, null, 'Started'), word('c', 0, 0, null, 'Untouched')], 1, TODAY);
    expect(ids(mix.fresh)).toEqual(['b']);
  });
});

describe('dailyQueue', () => {
  it('keeps the groups in order', () => {
    const queue = dailyQueue({ review: [word('r')], stale: [word('s')], fresh: [word('f')] }, () => 0);
    expect(ids(queue)).toEqual(['r', 's', 'f']);
  });
});

describe('topicDeck', () => {
  it('leads with what is urgent and caps at the size', () => {
    const deck = topicDeck([word('known', 5, 0, YESTERDAY), word('fresh'), word('stale', 5, 0, LONG_AGO), word('miss', 0, 1)], 3, TODAY);
    expect(ids(deck)).toEqual(['miss', 'stale', 'fresh']);
  });

  it('still deals a subject you already know', () => {
    expect(ids(topicDeck([word('known', 5, 0, YESTERDAY)], 10, TODAY))).toEqual(['known']);
  });
});

describe('parseSessionSize', () => {
  it('takes the sizes on offer only', () => {
    expect(parseSessionSize(20)).toBe(20);
    expect(parseSessionSize(25)).toBeNull();
    expect(parseSessionSize('20')).toBeNull();
  });
});
