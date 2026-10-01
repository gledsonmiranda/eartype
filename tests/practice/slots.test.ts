import { describe, expect, it } from 'vitest';
import { fillWord, revealNextWord, slotWords, wordStatus } from '@/lib/practice/slots';

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
    expect(slots.at(-1)).toEqual({ char: 's', kind: 'overflow' });
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

describe('revealNextWord', () => {
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
