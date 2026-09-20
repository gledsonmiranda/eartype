import { describe, expect, it } from 'vitest';
import { compare, editDistance, isPerfect, isTypo, missedWords } from '@/lib/diff';
import { canonicalize } from '@/lib/normalize';

const statuses = (reference: string, typed: string) =>
  compare(reference, typed).tokens.map((token) => token.status);

const accuracy = (reference: string, typed: string) => compare(reference, typed).accuracy;

describe('the spec’s mandatory cases (§5.1)', () => {
  it.each([
    'I am going to go',
    'I’m gonna go',
    'Im gonna go',
    "I'm going to go",
    'I am gonna go',
  ])('"I\'m gonna go" ≡ "%s" scores 100%%', (typed) => {
    const result = compare("I'm gonna go", typed);
    expect(result.accuracy).toBe(1);
    expect(isPerfect(result)).toBe(true);
  });

  it('"the dog\'s bone" ≠ "the dog is bone" — the possessive is not expanded', () => {
    const result = compare("the dog's bone", 'the dog is bone');
    expect(result.accuracy).toBeLessThan(1);
    expect(isPerfect(result)).toBe(false);
    expect(result.tokens.some((t) => t.status === 'wrong' || t.status === 'extra')).toBe(true);
  });

  it('but "he\'s gone" matches both "he is gone" and "he has gone"', () => {
    expect(accuracy("he's gone", 'he is gone')).toBe(1);
    expect(accuracy("he's gone", 'he has gone')).toBe(1);
  });
});

describe('compare — getting it right', () => {
  it('identical sentence', () => {
    const result = compare('the cool thing about these guys', 'the cool thing about these guys');
    expect(result.accuracy).toBe(1);
    expect(result.tokens.every((token) => token.status === 'correct')).toBe(true);
  });

  it('ignores case and punctuation', () => {
    expect(accuracy('All right, so here we are.', 'all right so here we are')).toBe(1);
  });

  it('accepts UK spelling and spelled-out digits', () => {
    expect(accuracy('the colour of 21 things', 'the color of twenty one things')).toBe(1);
  });

  it('skipping filler is not an error', () => {
    expect(accuracy('so uh I think', 'so I think')).toBe(1);
    expect(accuracy('so I think', 'so uh I think')).toBe(1);
  });

  it('empty on both sides counts as right', () => {
    expect(accuracy('', '')).toBe(1);
  });

  it('typing nothing scores zero', () => {
    const result = compare('the cool thing', '');
    expect(result.accuracy).toBe(0);
    expect(result.tokens.map((token) => token.status)).toEqual(['missing', 'missing', 'missing']);
  });
});

describe('compare — how each token is classified', () => {
  it('wrong word', () => {
    const result = compare('the cool thing', 'the warm thing');
    expect(result.tokens.map((token) => token.status)).toEqual(['correct', 'wrong', 'correct']);
    expect(result.tokens[1]).toMatchObject({ text: 'warm', expected: 'cool' });
    expect(result.accuracy).toBeCloseTo(2 / 3);
  });

  it('a typo is worth half a hit', () => {
    const result = compare('the elephants are big', 'the elephnats are big');
    expect(result.tokens[1].status).toBe('typo');
    expect(result.tokens[1].expected).toBe('elephants');
    expect(result.accuracy).toBeCloseTo(3.5 / 4);
  });

  it('missing word', () => {
    expect(statuses('in front of the elephants', 'in front the elephants')).toEqual([
      'correct',
      'correct',
      'missing',
      'correct',
      'correct',
    ]);
  });

  it('extra word', () => {
    expect(statuses('in front of elephants', 'in front of the elephants')).toEqual([
      'correct',
      'correct',
      'correct',
      'extra',
      'correct',
    ]);
  });

  it('extra words never push accuracy below zero', () => {
    expect(compare('hello', 'hello there my old friend indeed').accuracy).toBe(1);
  });

  it('keeps the sentence order even with an error in the middle', () => {
    const result = compare('all right so here we are', 'all right so there we are');
    expect(result.tokens.map((token) => token.text)).toEqual([
      'all',
      'right',
      'so',
      'there',
      'we',
      'are',
    ]);
  });

  it('a completely different sentence is not a pile of missing/extra', () => {
    const result = compare('cool warm thing', 'huge tiny house');
    expect(result.tokens.map((token) => token.status)).toEqual(['wrong', 'wrong', 'wrong']);
    expect(result.accuracy).toBe(0);
  });
});

describe('compare — the misalignment §5.1 prevents', () => {
  it('a contraction mid-sentence does not paint the rest red', () => {
    const result = compare(
      "we're gonna talk about the trunks",
      'we are going to talk about the trunks',
    );
    expect(result.accuracy).toBe(1);
  });

  it('an error after a contraction stays contained', () => {
    const result = compare(
      "we're gonna talk about the trunks",
      'we are going to talk about the tanks',
    );
    expect(result.tokens.filter((token) => token.status !== 'correct')).toHaveLength(1);
  });
});

describe('isTypo', () => {
  const typo = (a: string, b: string) => isTypo(canonicalize(a)[0], canonicalize(b)[0]);

  it('one letter off in a long word', () => {
    expect(typo('elephants', 'elephnats')).toBe(true);
    expect(typo('trunks', 'trunk')).toBe(true);
  });

  it('two edits only count above 5 letters', () => {
    expect(typo('elephants', 'elefants')).toBe(true);
    expect(typo('thing', 'tning')).toBe(true);
  });

  it('a swapped pair counts as one slip, not two', () => {
    // Plain Levenshtein scores `thing`/`thnig` as 2 and, at 5 letters, would
    // call it a wrong word. Transposition is the commonest keyboard slip.
    expect(typo('thing', 'thnig')).toBe(true);
  });

  it('a short word with one letter changed is another word, not a typo', () => {
    expect(typo('is', 'it')).toBe(false);
    expect(typo('can', 'man')).toBe(false);
    expect(typo('the', 'he')).toBe(false);
  });

  it('numbers have no typos — 21 and 24 are different numbers', () => {
    expect(typo('21', '24')).toBe(false);
    expect(typo('1990', '1991')).toBe(false);
  });

  it('distant words are not typos', () => {
    expect(typo('elephants', 'giraffes')).toBe(false);
  });
});

describe('editDistance', () => {
  it.each([
    ['', '', 0],
    ['a', '', 1],
    ['kitten', 'sitting', 3],
    ['thing', 'thing', 0],
    ['abc', 'abd', 1],
    ['thing', 'thnig', 1],
  ])('%s → %s = %i', (a, b, expected) => {
    expect(editDistance(a, b)).toBe(expected);
  });

  it('the cutoff returns limit + 1 instead of the exact value', () => {
    expect(editDistance('elephants', 'giraffes', 2)).toBe(3);
  });
});

describe('strict mode', () => {
  it('demands punctuation and case', () => {
    expect(
      compare('All right, so here we are.', 'all right so here we are', 'strict').accuracy,
    ).toBeLessThan(1);
  });

  it('and does not expand contractions', () => {
    expect(compare("I'm gonna go", 'I am going to go', 'strict').accuracy).toBeLessThan(1);
  });

  it('but still ignores extra whitespace', () => {
    expect(compare('All right,  so here', 'All right, so here', 'strict').accuracy).toBe(1);
  });
});

describe('missedWords — feeds §RF-08', () => {
  it('lists what the reference expected, lowercased', () => {
    const result = compare('The Cool thing about Trunks', 'the warm thing about');
    expect(missedWords(result)).toEqual(['cool', 'trunks']);
  });

  it('a typo is left out: the ear got it right', () => {
    expect(missedWords(compare('the elephants', 'the elephnats'))).toEqual([]);
  });
});
