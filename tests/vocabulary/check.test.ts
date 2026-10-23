import { describe, expect, it } from 'vitest';
import { acceptedAnswers, checkAnswer, checkSpoken, normalizeAnswer } from '@/lib/vocabulary/check';

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

  it('drops the punctuation a recognizer adds', () => {
    expect(normalizeAnswer('Fridge.')).toBe('fridge');
    expect(normalizeAnswer('"a fork!"')).toBe('fork');
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

describe('checkSpoken', () => {
  it('takes the best of the recognizer guesses', () => {
    expect(checkSpoken(sofa, ['so far', 'sofa'])).toEqual({ verdict: 'right', heard: 'sofa' });
    expect(checkSpoken(sofa, ['Couch.'])).toEqual({ verdict: 'right', heard: 'Couch.' });
  });

  it("keeps the recognizer's favorite when nothing fits", () => {
    expect(checkSpoken(fork, ['four', 'fur'])).toEqual({ verdict: 'wrong', heard: 'four' });
  });

  it('marks a near miss as almost', () => {
    expect(checkSpoken(fork, ['folk', 'fort'])).toEqual({ verdict: 'almost', heard: 'folk' });
  });

  it('handles no guesses at all', () => {
    expect(checkSpoken(fork, [])).toEqual({ verdict: 'wrong', heard: '' });
  });
});
