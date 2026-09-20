/**
 * RF-07 — where you are in the video and how each segment went.
 *
 * Phase 1 keeps no history (SPEC §11), so this is only the shape of the
 * current run: one outcome per segment, the attempts spent on the segment in
 * front of you, and the moves that change either. Pure, so the practice
 * screen can stay about rendering.
 */

export type SegmentOutcome =
  /** Not answered yet. */
  | 'pending'
  /** Typed correctly. */
  | 'correct'
  /** Wrong, and you moved on anyway. */
  | 'accepted'
  /** Revealed without answering. */
  | 'skipped';

export type Session = {
  readonly total: number;
  readonly index: number;
  readonly outcomes: readonly SegmentOutcome[];
  /** Checks spent on the current segment — reset when it changes. */
  readonly attempts: number;
};

export function startSession(total: number, index = 0): Session {
  return {
    total,
    index: clamp(index, total),
    outcomes: Array.from({ length: total }, () => 'pending' as const),
    attempts: 0,
  };
}

function clamp(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(index, 0), total - 1);
}

function withOutcome(session: Session, outcome: SegmentOutcome): readonly SegmentOutcome[] {
  return session.outcomes.map((current, index) => (index === session.index ? outcome : current));
}

/** One more check on the same segment: the answer was wrong and stays open. */
export function countAttempt(session: Session): Session {
  return { ...session, attempts: session.attempts + 1 };
}

export function recordOutcome(session: Session, outcome: SegmentOutcome): Session {
  return { ...session, outcomes: withOutcome(session, outcome) };
}

/**
 * Moves to a segment, forgetting the attempts spent on the last one. Past the
 * last segment the index stays put — `isFinished` is what ends the run.
 */
export function goTo(session: Session, index: number): Session {
  return { ...session, index: clamp(index, session.total), attempts: 0 };
}

export function next(session: Session): Session {
  return goTo(session, session.index + 1);
}

export function previous(session: Session): Session {
  return goTo(session, session.index - 1);
}

/** Every segment answered — including the ones given up on. */
export function isFinished(session: Session): boolean {
  return session.total > 0 && session.outcomes.every((outcome) => outcome !== 'pending');
}

/** The first segment still open, or `null` when there is none. */
export function firstPending(session: Session): number | null {
  const index = session.outcomes.findIndex((outcome) => outcome === 'pending');
  return index === -1 ? null : index;
}

/**
 * Whether a segment's text may be on screen. Answering it earns the reveal —
 * including the answers given up on, since those already showed the text — and
 * `showAll` is the escape hatch for when you want to read along instead of
 * practise.
 */
export function isRevealed(outcome: SegmentOutcome, showAll = false): boolean {
  return showAll || outcome !== 'pending';
}

export type SessionTally = {
  correct: number;
  accepted: number;
  skipped: number;
  pending: number;
  /** Correct over answered, 0..1 — `null` before anything is answered. */
  accuracy: number | null;
};

export function tally(session: Session): SessionTally {
  const count = (outcome: SegmentOutcome) =>
    session.outcomes.filter((current) => current === outcome).length;

  const correct = count('correct');
  const accepted = count('accepted');
  const skipped = count('skipped');
  const answered = correct + accepted + skipped;

  return {
    correct,
    accepted,
    skipped,
    pending: count('pending'),
    accuracy: answered === 0 ? null : correct / answered,
  };
}
