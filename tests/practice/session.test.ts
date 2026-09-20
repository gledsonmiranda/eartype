import { describe, expect, it } from 'vitest';
import {
  countAttempt,
  firstPending,
  goTo,
  isFinished,
  next,
  previous,
  recordOutcome,
  startSession,
  tally,
} from '@/lib/practice/session';

describe('startSession', () => {
  it('starts at the first segment with everything pending', () => {
    const session = startSession(3);

    expect(session).toMatchObject({ total: 3, index: 0, attempts: 0 });
    expect(session.outcomes).toEqual(['pending', 'pending', 'pending']);
  });

  it('can start further in, for a video resumed by timestamp', () => {
    expect(startSession(5, 2).index).toBe(2);
  });

  it('never starts outside the video', () => {
    expect(startSession(3, 99).index).toBe(2);
    expect(startSession(3, -1).index).toBe(0);
    expect(startSession(0).index).toBe(0);
  });
});

describe('moving between segments', () => {
  it('advances and goes back', () => {
    const session = startSession(3);

    expect(next(session).index).toBe(1);
    expect(previous(next(session)).index).toBe(0);
  });

  it('stops at the edges instead of falling off', () => {
    const session = startSession(2);

    expect(next(next(next(session))).index).toBe(1);
    expect(previous(session).index).toBe(0);
  });

  it('forgets the attempts spent on the segment left behind', () => {
    const session = countAttempt(countAttempt(startSession(3)));

    expect(session.attempts).toBe(2);
    expect(next(session).attempts).toBe(0);
    expect(goTo(session, 2).attempts).toBe(0);
  });
});

describe('outcomes', () => {
  it('records against the current segment only', () => {
    const session = recordOutcome(next(startSession(3)), 'correct');

    expect(session.outcomes).toEqual(['pending', 'correct', 'pending']);
  });

  it('is finished once nothing is pending', () => {
    let session = startSession(2);
    expect(isFinished(session)).toBe(false);

    session = recordOutcome(session, 'correct');
    expect(isFinished(session)).toBe(false);

    session = recordOutcome(next(session), 'skipped');
    expect(isFinished(session)).toBe(true);
  });

  it('an empty video is not a finished one', () => {
    expect(isFinished(startSession(0))).toBe(false);
  });

  it('points at the first segment still open', () => {
    const session = recordOutcome(startSession(3), 'accepted');

    expect(firstPending(session)).toBe(1);
    expect(firstPending(recordOutcome(startSession(1), 'correct'))).toBeNull();
  });
});

describe('tally', () => {
  it('counts each outcome and the accuracy over what was answered', () => {
    let session = startSession(4);
    session = next(recordOutcome(session, 'correct'));
    session = next(recordOutcome(session, 'correct'));
    session = next(recordOutcome(session, 'accepted'));

    expect(tally(session)).toEqual({
      correct: 2,
      accepted: 1,
      skipped: 0,
      pending: 1,
      accuracy: 2 / 3,
    });
  });

  it('has no accuracy before anything is answered', () => {
    expect(tally(startSession(3)).accuracy).toBeNull();
  });
});
