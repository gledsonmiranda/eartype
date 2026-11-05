/**
 * What to practice next, worked out from the stats each word already has: what
 * you keep missing first, then what you haven't seen in a while, then new words.
 * Picking is deterministic, so the session on the button is the one you get;
 * only the order inside each group is random.
 */

import { read, write } from '@/lib/storage/local';
import { shuffle } from '@/lib/vocabulary/session';
import { categoriesOf, isoDate, type Word } from '@/lib/vocabulary/words';

export const SESSION_SIZES = [10, 20, 30] as const;
export type SessionSize = (typeof SESSION_SIZES)[number];

export const DEFAULT_SESSION_SIZE: SessionSize = 20;
export const FIRST_SESSION_SIZE: SessionSize = 10;

/** Seen longer ago than this, a word comes back even if you know it. */
const STALE_AFTER_DAYS = 7;
/** Right this many times more than wrong, a word counts as firm. */
const FIRM_MARGIN = 3;

export type WordProgress = { firm: number; learning: number; fresh: number; total: number };
export type DailyMix = { review: Word[]; stale: Word[]; fresh: Word[] };

function isNew(word: Word): boolean {
  return word.timesRight + word.timesWrong === 0;
}

/** Stats keep totals, not the last answer: a miss stays here until rights outnumber wrongs. */
export function needsReview(word: Word): boolean {
  return !isNew(word) && word.timesWrong >= word.timesRight;
}

export function isFirm(word: Word): boolean {
  return word.timesRight - word.timesWrong >= FIRM_MARGIN;
}

export function isStale(word: Word, today: string): boolean {
  if (word.lastSeen === null) return false;
  const cutoff = new Date(`${today}T12:00:00`);
  cutoff.setDate(cutoff.getDate() - STALE_AFTER_DAYS);
  return word.lastSeen < isoDate(cutoff);
}

export function hasPracticed(words: readonly Word[]): boolean {
  return words.some((word) => !isNew(word));
}

export function progressOf(words: readonly Word[]): WordProgress {
  const fresh = words.filter(isNew).length;
  const firm = words.filter(isFirm).length;
  return { firm, learning: words.length - fresh - firm, fresh, total: words.length };
}

const byOldest = (a: Word, b: Word) => (a.lastSeen ?? '').localeCompare(b.lastSeen ?? '');

function reviewFirst(words: readonly Word[]): Word[] {
  return words
    .filter(needsReview)
    .sort((a, b) => b.timesWrong - b.timesRight - (a.timesWrong - a.timesRight) || byOldest(a, b));
}

function staleFirst(words: readonly Word[], today: string): Word[] {
  return words.filter((word) => !needsReview(word) && isStale(word, today)).sort(byOldest);
}

/** Finishes the category furthest along before opening another; a new one starts with the shortest. */
function freshInOrder(words: readonly Word[]): Word[] {
  const decks = categoriesOf(words).map((category) => {
    const deck = words.filter((word) => word.category === category);
    const fresh = deck.filter(isNew);
    return { fresh, size: deck.length, seen: (deck.length - fresh.length) / deck.length };
  });
  return decks.sort((a, b) => b.seen - a.seen || a.size - b.size).flatMap((deck) => deck.fresh);
}

/** Up to `size` words; a group that runs short leaves its room to the others, in priority order. */
export function dailyMix(words: readonly Word[], size: number, today = isoDate()): DailyMix {
  const review = reviewFirst(words);
  const stale = staleFirst(words, today);
  const fresh = freshInOrder(words);

  const reviewQuota = Math.ceil(size * 0.4);
  const staleQuota = Math.round(size * 0.25);
  const groups = [
    { words: review, count: Math.min(review.length, reviewQuota) },
    { words: stale, count: Math.min(stale.length, staleQuota) },
    { words: fresh, count: Math.min(fresh.length, size - reviewQuota - staleQuota) },
  ];

  let room = size - groups.reduce((total, group) => total + group.count, 0);
  for (const group of groups) {
    const extra = Math.min(room, group.words.length - group.count);
    group.count += extra;
    room -= extra;
  }

  const [picked, oldest, unseen] = groups.map((group) => group.words.slice(0, group.count));
  return { review: picked, stale: oldest, fresh: unseen };
}

export function mixSize(mix: DailyMix): number {
  return mix.review.length + mix.stale.length + mix.fresh.length;
}

/** The session keeps the groups in order and shuffles inside each. */
export function dailyQueue(mix: DailyMix, random?: () => number): Word[] {
  return [...shuffle(mix.review, random), ...shuffle(mix.stale, random), ...shuffle(mix.fresh, random)];
}

/** One subject, most urgent words first. Unlike the daily mix it is never empty: words you know fill the end. */
export function topicDeck(words: readonly Word[], size: number, today = isoDate()): Word[] {
  const urgent = [...reviewFirst(words), ...staleFirst(words, today), ...freshInOrder(words)];
  const chosen = new Set(urgent);
  const rest = words.filter((word) => !chosen.has(word)).sort(byOldest);
  return [...urgent, ...rest].slice(0, size);
}

// ---------------------------------------------------------------------------
// The session size sticks, like the answer mode.

const SIZE_KEY = 'eartype:vocabulary-session-size';

export function parseSessionSize(value: unknown): SessionSize | null {
  return SESSION_SIZES.find((size) => size === value) ?? null;
}

export function loadSessionSize(): SessionSize {
  return parseSessionSize(read(SIZE_KEY)) ?? DEFAULT_SESSION_SIZE;
}

export function saveSessionSize(size: SessionSize): void {
  write(SIZE_KEY, size);
}
