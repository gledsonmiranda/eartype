import { describe, expect, it } from 'vitest';
import { canonicalize, numberFromWords, ordinalSuffix, tokensMatch } from '@/lib/normalize';

/** Only the canonical forms, which is what the diff compares. */
const canon = (text: string) => canonicalize(text).map((token) => token.canonical);

describe('canonicalize — basics', () => {
  it('ignores case', () => {
    expect(canon('The Dog')).toEqual(['the', 'dog']);
  });

  it('ignores edge punctuation', () => {
    expect(canon('Well, "hello" — world!')).toEqual(['well', 'hello', 'world']);
  });

  it('ignores repeated whitespace', () => {
    expect(canon('a   b c')).toEqual(['a', 'b', 'c']);
  });

  it('normalizes curly apostrophes', () => {
    expect(canon('don’t')).toEqual(canon("don't"));
  });

  it('empty text gives an empty list', () => {
    expect(canonicalize('')).toEqual([]);
    expect(canonicalize('   ')).toEqual([]);
  });

  it('splits compound words', () => {
    expect(canon('well-known')).toEqual(['well', 'known']);
    expect(canon('well known')).toEqual(['well', 'known']);
  });

  it('accepts UK spelling', () => {
    expect(canon('colour')).toEqual(canon('color'));
    expect(canon('I realised it')).toEqual(canon('I realized it'));
    expect(canon('travelling')).toEqual(canon('traveling'));
  });

  it('ignores ASR filler', () => {
    expect(canon('uh so um hmm yeah')).toEqual(['so', 'yeah']);
  });

  it('acronyms ignore dots and case', () => {
    expect(canon('N.A.S.A.')).toEqual(['nasa']);
    expect(canon('NASA')).toEqual(['nasa']);
    expect(canon('the U.S. economy')).toEqual(['the', 'us', 'economy']);
  });
});

describe('canonicalize — contractions and reductions (§5.1)', () => {
  it.each([
    ["don't", 'do not'],
    ['dont', 'do not'],
    ["I'm", 'I am'],
    ['Im', 'I am'],
    ["they're", 'they are'],
    ["won't", 'will not'],
    ["can't", 'can not'],
    ['cannot', 'can not'],
    ['can not', 'can not'],
    ['gonna', 'going to'],
    ['wanna', 'want to'],
    ['gotta', 'got to'],
    ['tryna', 'trying to'],
    ['kinda', 'kind of'],
    ['outta', 'out of'],
    ['shoulda', 'should have'],
    ["should've", 'should have'],
    ['lemme', 'let me'],
    ['gimme', 'give me'],
    ["y'all", 'you all'],
    ['dunno', 'do not know'],
    ["'cause", 'because'],
    ['cuz', 'because'],
    ["let's", 'let us'],
  ])('%s ≡ %s', (a, b) => {
    expect(canon(a)).toEqual(canon(b));
  });

  it("'em stands for them", () => {
    expect(canon("give 'em a call")).toEqual(canon('give them a call'));
  });

  it('expansion keeps both sides at the same token count', () => {
    expect(canon("I'm gonna go").length).toBe(canon('I am going to go').length);
  });
});

describe('canonicalize — ambiguity resolved by variant sets', () => {
  it("he's accepts both he is and he has", () => {
    const contracted = canonicalize("he's");
    expect(contracted.map((token) => token.canonical)).toEqual(['he', 'is']);
    expect(contracted[1].variants).toContain('has');
    expect(tokensMatch(contracted[1], canonicalize('has')[0])).toBe(true);
    expect(tokensMatch(contracted[1], canonicalize('is')[0])).toBe(true);
  });

  it("I'd accepts would and had", () => {
    expect(canonicalize("I'd")[1].variants).toEqual(expect.arrayContaining(['would', 'had']));
  });

  it("ain't accepts am/is/are/has/have plus not", () => {
    const tokens = canonicalize("ain't");
    expect(tokens).toHaveLength(2);
    expect(tokens[0].variants).toEqual(expect.arrayContaining(['am', 'is', 'are', 'has', 'have']));
    expect(tokens[1].canonical).toBe('not');
  });

  it("the possessive 's is NOT expanded", () => {
    expect(canon("the dog's bone")).toEqual(['the', "dog's", 'bone']);
    expect(canon("John's car")).toEqual(["john's", 'car']);
  });

  it('an audible collision is not treated as a contraction', () => {
    expect(canon('well')).toEqual(['well']);
    expect(canon('were')).toEqual(['were']);
    expect(canon("we'll")).toEqual(['we', 'will']);
    expect(canon("we're")).toEqual(['we', 'are']);
  });

  it('an inaudible collision is tolerated on purpose', () => {
    // `its` and `it's` sound identical: requiring the apostrophe would be
    // grading spelling rather than listening.
    expect(canon('its')).toEqual(canon("it's"));
  });
});

describe('canonicalize — numbers (§5.2)', () => {
  it.each([
    ['5', 'five'],
    ['21', 'twenty-one'],
    ['21', 'twenty one'],
    ['100', 'one hundred'],
    ['1000', 'one thousand'],
    ['1500', 'fifteen hundred'],
    ['1500', 'one thousand five hundred'],
    ['1990', 'nineteen ninety'],
    ['2024', 'twenty twenty-four'],
    ['2024', 'two thousand twenty-four'],
    ['125', 'one hundred twenty five'],
    ['1st', 'first'],
    ['3rd', 'third'],
    ['22nd', 'twenty second'],
    ['10%', 'ten percent'],
  ])('%s ≡ %s', (a, b) => {
    expect(canon(a)).toEqual(canon(b));
  });

  it('a digit number is a single token', () => {
    expect(canon('there were 21 people')).toEqual(['there', 'were', '21', 'people']);
  });

  it('a run of number words collapses into a single token', () => {
    expect(canon('there were twenty one people')).toEqual(['there', 'were', '21', 'people']);
  });

  it('a thousands separator does not get in the way', () => {
    expect(canon('1,500')).toEqual(['1500']);
  });

  it('loose units do not add up — "one two three" is three numbers', () => {
    expect(canon('one two three')).toEqual(['1', '2', '3']);
  });

  it('different numbers stay different', () => {
    expect(canon('21')).not.toEqual(canon('22'));
    expect(canon('1990')).not.toEqual(canon('1991'));
  });

  it('numberFromWords', () => {
    expect(numberFromWords(['nineteen', 'ninety'])).toBe(1990);
    expect(numberFromWords(['twenty', 'five'])).toBe(25);
    expect(numberFromWords(['twenty', 'twenty'])).toBe(2020);
    expect(numberFromWords(['two', 'thousand', 'twenty', 'four'])).toBe(2024);
    expect(numberFromWords(['one', 'two'])).toBeNull();
    expect(numberFromWords(['cat'])).toBeNull();
    expect(numberFromWords([])).toBeNull();
  });

  it('ordinalSuffix covers the 11–13 exception', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinalSuffix)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '101st',
    ]);
  });
});

describe('canonicalize — strict mode', () => {
  it('only normalizes whitespace', () => {
    expect(canonicalize('The  Dog’s bone.', 'strict').map((token) => token.canonical)).toEqual([
      'The',
      'Dog’s',
      'bone.',
    ]);
  });

  it('does not expand contractions', () => {
    expect(canonicalize("I'm", 'strict').map((token) => token.canonical)).toEqual(["I'm"]);
  });
});

describe('Token.surface — what reaches the screen', () => {
  it('keeps the original spelling when nothing is expanded', () => {
    expect(canonicalize('The Dog!').map((token) => token.surface)).toEqual(['The', 'Dog']);
  });

  it('an expansion shows the canonical form', () => {
    expect(canonicalize('gonna').map((token) => token.surface)).toEqual(['going', 'to']);
  });
});
