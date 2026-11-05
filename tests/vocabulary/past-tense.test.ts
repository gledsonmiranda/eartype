/**
 * The past-tense deck: the shipped list has to be answerable by its own past
 * forms, the extra `present` field has to survive storage and backups, and
 * "all" has to stay Portuguese → English.
 */

import { describe, expect, it } from 'vitest';
import verbs from '@/content/vocabulary/past-tense.json';
import { checkAnswer } from '@/lib/vocabulary/check';
import { ALL_CATEGORIES, deckOf } from '@/lib/vocabulary/session';
import {
  cleanFields,
  EMPTY_OVERLAY,
  editWord,
  isComplete,
  mergeWords,
  PAST_TENSE_CATEGORY,
  parseOverlay,
  promptOf,
  type BuiltInWord,
} from '@/lib/vocabulary/words';

const list: BuiltInWord[] = verbs;

const go: BuiltInWord = {
  id: 'p_1',
  present: 'go',
  portuguese: 'ir',
  english: 'went',
  alternatives: [],
  category: PAST_TENSE_CATEGORY,
};
const stove: BuiltInWord = { id: 'w_1', portuguese: 'fogão', english: 'stove', alternatives: [], category: 'Cozinha' };

describe('content/vocabulary/past-tense.json', () => {
  it('has the most used verbs', () => {
    expect(list.length).toBeGreaterThanOrEqual(100);
    const presents = list.map((word) => word.present);
    for (const verb of ['be', 'have', 'do', 'say', 'go', 'get', 'make', 'know', 'think', 'take']) {
      expect(presents).toContain(verb);
    }
  });

  it('has unique, well-formed ids and no verb twice', () => {
    const ids = list.map((word) => word.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^p_\d{4}$/);
    expect(new Set(list.map((word) => word.present)).size).toBe(list.length);
  });

  it('fills every field and stays in its category', () => {
    for (const word of list) {
      expect(word.present?.trim(), word.id).toBeTruthy();
      expect(word.portuguese.trim(), word.id).not.toBe('');
      expect(word.english.trim(), word.id).not.toBe('');
      expect(word.category, word.id).toBe(PAST_TENSE_CATEGORY);
    }
  });

  it('has no Portuguese meaning twice', () => {
    expect(new Set(list.map((word) => word.portuguese)).size).toBe(list.length);
  });

  it('accepts its own answers', () => {
    for (const word of list) {
      expect(checkAnswer(word, word.english), word.id).toBe('right');
      for (const alternative of word.alternatives) expect(checkAnswer(word, alternative), word.id).toBe('right');
    }
  });

  it('does not take the present for the past of a regular verb', () => {
    const want = list.find((word) => word.present === 'want');
    expect(want && checkAnswer(want, 'want')).not.toBe('right');
  });
});

describe('promptOf', () => {
  it('asks the present of a past-tense verb and the Portuguese of anything else', () => {
    expect(promptOf(go)).toBe('go');
    expect(promptOf(stove)).toBe('fogão');
  });

  it('ignores a leftover present once the word has left the category', () => {
    expect(promptOf({ ...go, category: 'Casa' })).toBe('ir');
  });
});

describe('deckOf', () => {
  const words = mergeWords([go, stove], EMPTY_OVERLAY);

  it('leaves past-tense verbs out of "all"', () => {
    expect(deckOf(words, ALL_CATEGORIES).map((word) => word.id)).toEqual(['w_1']);
  });

  it('deals them when their own category is chosen', () => {
    expect(deckOf(words, PAST_TENSE_CATEGORY).map((word) => word.id)).toEqual(['p_1']);
  });
});

describe('the present field', () => {
  it('is required in the past-tense category only', () => {
    const fields = { portuguese: 'ir', english: 'went', alternatives: [], category: PAST_TENSE_CATEGORY };
    expect(isComplete(cleanFields({ ...fields, present: '  ' }))).toBe(false);
    expect(isComplete(cleanFields({ ...fields, present: ' go ' }))).toBe(true);
    expect(isComplete(cleanFields({ ...fields, category: 'Casa' }))).toBe(true);
  });

  it('survives an edit and a round trip through storage', () => {
    const overlay = editWord(EMPTY_OVERLAY, 'p_1', { ...go, present: 'walk', english: 'walked' });
    const added = { ...overlay, added: [{ ...go, id: 'u_1', present: 'run' }] };
    const parsed = parseOverlay(JSON.parse(JSON.stringify(added)));

    expect(parsed?.edited.p_1.present).toBe('walk');
    expect(parsed?.added[0].present).toBe('run');
    expect(mergeWords([go], parsed ?? EMPTY_OVERLAY)[0].present).toBe('walk');
  });

  it('is rejected when it is not text', () => {
    expect(parseOverlay({ ...EMPTY_OVERLAY, edited: { p_1: { present: 3 } } })).toBeNull();
    expect(parseOverlay({ ...EMPTY_OVERLAY, added: [{ ...go, present: 3 }] })).toBeNull();
  });
});
