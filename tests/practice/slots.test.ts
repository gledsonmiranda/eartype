import { describe, expect, it } from 'vitest';
import { fillWord, slotWords, wordStatus } from '@/lib/practice/slots';

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

  it('shows words typed past the end of the sentence as extra', () => {
    const words = slotWords('hi there', 'hi there you ');
    expect(words).toHaveLength(3);
    expect(words[2]).toMatchObject({ reference: null, state: 'done', status: 'extra' });
  });
});
