import { describe, expect, it } from 'vitest';
import { acceptedAnswers, checkAnswer, normalizeAnswer } from '@/lib/vocabulary/check';

const sofa = { english: 'sofa', alternatives: ['couch'] };
const fork = { english: 'fork', alternatives: [] };

describe('normalizeAnswer', () => {
  it('ignores case, edge spaces and a leading article', () => {
    expect(normalizeAnswer('  The Fork ')).toBe('fork');
    expect(normalizeAnswer('a fork')).toBe('fork');
    expect(normalizeAnswer('an  apple')).toBe('apple');
  });

  it('keeps an article that is part of the word', () => {
    expect(normalizeAnswer('another')).toBe('another');
    expect(normalizeAnswer('theater')).toBe('theater');
  });

  it('straightens curly apostrophes', () => {
    expect(normalizeAnswer('o’clock')).toBe("o'clock");
  });
});

describe('checkAnswer', () => {
  it('accepts the word and its alternatives', () => {
    expect(checkAnswer(sofa, 'sofa')).toBe('right');
    expect(checkAnswer(sofa, 'Couch')).toBe('right');
    expect(checkAnswer(fork, 'the fork')).toBe('right');
  });

  it('calls one wrong, missing, extra or swapped letter "almost"', () => {
    expect(checkAnswer(sofa, 'sopha')).toBe('wrong');
    expect(checkAnswer(sofa, 'sofaa')).toBe('almost');
    expect(checkAnswer(sofa, 'sfoa')).toBe('almost');
    expect(checkAnswer(sofa, 'cuch')).toBe('almost');
    expect(checkAnswer(fork, 'frok')).toBe('almost');
  });

  it('calls two edits wrong', () => {
    expect(checkAnswer(fork, 'fake')).toBe('wrong');
    expect(checkAnswer({ english: 'refrigerator', alternatives: [] }, 'refrigerater')).toBe('almost');
    expect(checkAnswer({ english: 'refrigerator', alternatives: [] }, 'refrigeratr')).toBe('almost');
    expect(checkAnswer({ english: 'refrigerator', alternatives: [] }, 'refrijerater')).toBe('wrong');
  });

  it('never calls a short word "almost"', () => {
    expect(checkAnswer({ english: 'cat', alternatives: [] }, 'cap')).toBe('wrong');
  });

  it('calls an empty answer wrong', () => {
    expect(checkAnswer(fork, '   ')).toBe('wrong');
  });

  it('works for phrases', () => {
    const cuttingBoard = { english: 'cutting board', alternatives: ['chopping board'] };
    expect(checkAnswer(cuttingBoard, 'Cutting  Board')).toBe('right');
    expect(checkAnswer(cuttingBoard, 'a chopping board')).toBe('right');
    expect(checkAnswer(cuttingBoard, 'cuting board')).toBe('almost');
  });
});

describe('acceptedAnswers', () => {
  it('drops duplicates once normalized', () => {
    expect(acceptedAnswers({ english: 'Fridge', alternatives: ['fridge', 'the fridge'] })).toEqual(['fridge']);
  });
});
