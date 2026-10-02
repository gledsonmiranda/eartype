import { describe, expect, it } from 'vitest';
import { compare, isPerfect } from '@/lib/correction/diff';
import { fillWord, revealNextWord, separateJoinedParts, slotWords, wordStatus } from '@/lib/practice/slots';

const render = (slots: { char: string }[]) => slots.map((slot) => slot.char).join('');

describe('fillWord', () => {
  it('draws one blank per letter before anything is typed', () => {
    expect(render(fillWord('hello', ''))).toBe('_____');
  });

  it('fills blanks from the left as letters arrive', () => {
    const slots = fillWord('hello', 'he');
    expect(render(slots)).toBe('he___');
    expect(slots.map((slot) => slot.kind)).toEqual(['typed', 'typed', 'empty', 'empty', 'empty']);
  });

  it('shows punctuation as-is, whether or not you typed it', () => {
    expect(render(fillWord("don't", ''))).toBe("___'_");
    expect(render(fillWord("don't", 'dont'))).toBe("don't");
    expect(render(fillWord("don't", "don't"))).toBe("don't");
    expect(render(fillWord('don’t', 'don’t'))).toBe("don't");
    expect(render(fillWord('world.', 'world'))).toBe('world.');
  });

  it('keeps letters typed past the end, marked as overflow', () => {
    const slots = fillWord('cat', 'cats');
    expect(render(slots)).toBe('cats');
    expect(slots.at(-1)).toMatchObject({ char: 's', kind: 'overflow' });
  });
});

describe('wordStatus', () => {
  it('uses the same leniency as the sentence check', () => {
    expect(wordStatus('Hello,', 'hello', 'lenient')).toBe('correct');
    expect(wordStatus("don't", 'dont', 'lenient')).toBe('correct');
    expect(wordStatus('thing', 'thnig', 'lenient')).toBe('typo');
    expect(wordStatus('cat', 'dog', 'lenient')).toBe('wrong');
  });
});

describe('slotWords', () => {
  it('starts with every word blank and the first one current', () => {
    const words = slotWords('the big cat', '');
    expect(words.map((word) => render(word.slots))).toEqual(['___', '___', '___']);
    expect(words.map((word) => word.state)).toEqual(['current', 'pending', 'pending']);
  });

  it('closes a word on space and grades it', () => {
    const words = slotWords('the big cat', 'the bog ');
    expect(words.map((word) => word.state)).toEqual(['done', 'done', 'current']);
    expect(words.map((word) => word.status)).toEqual(['correct', 'wrong', undefined]);
  });

  it('leaves the word being typed ungraded', () => {
    const words = slotWords('the big cat', 'the bi');
    expect(words[1]).toMatchObject({ state: 'current', status: undefined });
    expect(render(words[1].slots)).toBe('bi_');
  });

  it('closes the last word without a space once it is right', () => {
    const words = slotWords('the big cat.', 'the big cat');
    expect(words[2]).toMatchObject({ state: 'done', status: 'correct' });
  });

  it('closes and grades the last word once its blanks are all filled', () => {
    expect(slotWords('tough choices.', 'tough choicee')[1]).toMatchObject({ state: 'done', status: 'typo' });
    expect(slotWords('the big cat', 'the big dog')[2]).toMatchObject({ state: 'done', status: 'wrong' });
  });

  it('keeps the last word open while it still has blanks', () => {
    expect(slotWords('the big cat', 'the big ca')[2]).toMatchObject({ state: 'current', status: undefined });
    expect(slotWords('the big cat', 'the big co')[2]).toMatchObject({ state: 'current', status: undefined });
  });

  it('shows words typed past the end of the sentence as extra', () => {
    const words = slotWords('hi there', 'hi there you ');
    expect(words).toHaveLength(3);
    expect(words[2]).toMatchObject({ reference: null, state: 'done', status: 'extra' });
  });
});

describe('slotWords — hyphenated words', () => {
  const reference = "it's once-in-a-lifetime luck";

  it('draws each part with its hyphen, joined to the next', () => {
    const words = slotWords(reference, '');
    expect(words.map((word) => render(word.slots))).toEqual(["__'_", '____-', '__-', '_-', '________', '____']);
    expect(words.map((word) => word.joined)).toEqual([false, true, true, true, false, false]);
  });

  it('fills it the same whether typed with spaces, hyphens or neither', () => {
    for (const typed of [
      "it's once in a lifetime luck",
      "it's once-in-a-lifetime luck",
      "it's onceinalifetime luck",
      "it's once inalifetime luck",
    ]) {
      const words = slotWords(reference, typed);
      expect(words).toHaveLength(6);
      expect(words.map((word) => word.status)).toEqual(['correct', 'correct', 'correct', 'correct', 'correct', 'correct']);
    }
  });

  it('carries letters into the next part once a part is full', () => {
    const words = slotWords(reference, "it's oncei");
    expect(words.map((word) => render(word.slots)).slice(1, 3)).toEqual(['once-', 'i_-']);
    expect(words.map((word) => word.state).slice(1, 4)).toEqual(['done', 'current', 'pending']);
  });

  it('moves on to the next part as soon as a part is full', () => {
    const words = slotWords(reference, "it's once");
    expect(words[1]).toMatchObject({ state: 'done', status: 'correct' });
    expect(words[2].state).toBe('current');
  });

  it('closes a part on its hyphen', () => {
    const words = slotWords(reference, "it's once-");
    expect(words[1]).toMatchObject({ state: 'done', status: 'correct' });
    expect(words[2].state).toBe('current');
  });
});

describe('revealNextWord', () => {
  it('gives one part of a hyphenated word at a time', () => {
    expect(revealNextWord('a once-in-a-lifetime deal', 'a ')).toBe('a once-');
    expect(revealNextWord('a once-in-a-lifetime deal', 'a once-')).toBe('a once-in-');
    expect(revealNextWord('a once-in-a-lifetime deal', 'a once in a lif')).toBe('a once in a lifetime ');
    expect(revealNextWord('a once-in-a-lifetime deal', 'a oncei')).toBe('a oncein-');
    expect(revealNextWord('a once-in-a-lifetime deal', 'a once')).toBe('a oncein-');
  });

  it('gives the first word when nothing is typed yet', () => {
    expect(revealNextWord('hello big world', '')).toBe('hello ');
  });

  it('replaces the word being typed, keeping what came before', () => {
    expect(revealNextWord('hello big world', 'hello bi')).toBe('hello big ');
    expect(revealNextWord('hello big world', 'hello bxg')).toBe('hello big ');
  });

  it('gives the next word once the last one was closed with a space', () => {
    expect(revealNextWord('hello big world', 'hello ')).toBe('hello big ');
    expect(revealNextWord('hello big world', 'helo big ')).toBe('helo big world ');
  });

  it('keeps the reference punctuation of the word it gives', () => {
    expect(revealNextWord("I don't know.", 'I ')).toBe("I don't ");
    expect(revealNextWord("I don't know.", "I don't kn")).toBe("I don't know. ");
  });

  it('leaves the text alone past the last reference word', () => {
    expect(revealNextWord('hello world', 'hello world ')).toBe('hello world ');
    expect(revealNextWord('hello world', 'hello world extra')).toBe('hello world extra');
  });
});

describe('separateJoinedParts', () => {
  const reference = 'a once-in-a-lifetime deal';

  it('puts back the breaks between parts typed together', () => {
    expect(separateJoinedParts(reference, 'a onceinalifetime deal')).toBe('a once in a lifetime deal');
    expect(separateJoinedParts(reference, 'a oncein-a lifetime deal')).toBe('a once in-a lifetime deal');
  });

  it('leaves everything else as typed', () => {
    expect(separateJoinedParts(reference, 'a once-in-a-lifetime deal')).toBe('a once-in-a-lifetime deal');
    expect(separateJoinedParts('the big cat', 'thebig cat')).toBe('thebig cat');
  });

  it('lets the sentence check accept the hyphens left out', () => {
    for (const typed of ['a onceinalifetime deal', 'a oncein-a lifetime deal']) {
      expect(isPerfect(compare(reference, separateJoinedParts(reference, typed)))).toBe(true);
    }
  });
});

describe('slotWords — caret', () => {
  const carets = (reference: string, typed: string, caret?: number) =>
    slotWords(reference, typed, 'lenient', caret).map((word) => word.caret);

  it('sits on the first blank of the word being typed by default', () => {
    expect(carets('the big cat', 'the bi')).toEqual([undefined, 2, undefined]);
    expect(carets('the big cat', 'the ')).toEqual([undefined, 0, undefined]);
  });

  it('follows the caret moved back inside a word', () => {
    expect(carets('the big cat', 'the bi', 5)).toEqual([undefined, 1, undefined]);
    expect(carets('the big cat', 'the bi', 1)).toEqual([1, undefined, undefined]);
  });

  it('sits at the end of a word when moved back to just after it', () => {
    expect(carets('the big cat', 'the bi', 3)).toEqual([3, undefined, undefined]);
  });

  it('skips punctuation the reference shows but you did not type', () => {
    // `dont` → `don't`: after the `n` the next letter is `t`, past the `'`.
    expect(carets("I don't", 'I dont', 5)).toEqual([undefined, 4]);
  });

  it('leaves a word ungraded while the caret is back inside it', () => {
    // `kn|` with the old space still after it: being retyped, not wrong.
    const words = slotWords('you know that', 'you kn ', 'lenient', 6);
    expect(words[1]).toMatchObject({ state: 'current', status: undefined, reopened: true, caret: 2 });
    expect(slotWords('you know that', 'you kn ')[1]).toMatchObject({ state: 'done', status: 'wrong' });
  });

  it('lands in the right part of a hyphenated word typed together', () => {
    expect(carets('a once-in-a-lifetime deal', 'a onceina', 6)).toEqual([
      undefined,
      undefined,
      0,
      undefined,
      undefined,
      undefined,
    ]);
  });
});
