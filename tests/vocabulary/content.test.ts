/**
 * Guard for the built-in word list: every entry in content/vocabulary must be
 * complete, uniquely identified, and answerable by its own English word.
 */

import { describe, expect, it } from 'vitest';
import words from '@/content/vocabulary/words.json';
import { checkAnswer } from '@/lib/vocabulary/check';
import type { BuiltInWord } from '@/lib/vocabulary/words';

const list: BuiltInWord[] = words;

describe('content/vocabulary/words.json', () => {
  it('has the starter set', () => {
    expect(list.length).toBeGreaterThanOrEqual(500);
  });

  it('has unique, well-formed ids', () => {
    const ids = list.map((word) => word.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^w_\d{4}$/);
  });

  it('fills every field', () => {
    for (const word of list) {
      expect(word.portuguese.trim(), word.id).not.toBe('');
      expect(word.english.trim(), word.id).not.toBe('');
      expect(word.category.trim(), word.id).not.toBe('');
      for (const alternative of word.alternatives) expect(alternative.trim(), word.id).not.toBe('');
    }
  });

  it('has no Portuguese word twice in a category', () => {
    const keys = list.map((word) => `${word.category}|${word.portuguese}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('accepts its own answers', () => {
    for (const word of list) {
      expect(checkAnswer(word, word.english), word.id).toBe('right');
      for (const alternative of word.alternatives) expect(checkAnswer(word, alternative), word.id).toBe('right');
    }
  });
});
