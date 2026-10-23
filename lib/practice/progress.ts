/**
 * RF-07 — the run survives the tab. One record per video and one for the
 * toggles, in localStorage: no login, no server, and small enough that
 * IndexedDB (SPEC §7.1) can wait for attempt history.
 *
 * Outcomes are keyed by the segment's `startMs`, not its index (RF-03): if the
 * captions are segmented again, the segments that still line up keep what you
 * did with them and the rest go back to pending.
 *
 * Every storage access is wrapped — private windows, a full quota or the
 * server render all turn into "nothing saved", never a crash.
 */

import { firstPending, startSession, type SegmentOutcome, type Session } from '@/lib/practice/session';
import type { Segment } from '@/types';

type Answered = Exclude<SegmentOutcome, 'pending'>;

export type StoredProgress = {
  v: 1;
  /** Segment count when saved — what the library card divides by. */
  total: number;
  /** Segment `startMs` → outcome; only answered segments. */
  outcomes: Record<string, Answered>;
  /** `startMs` of the segment you were on. */
  currentStartMs: number;
  updatedAt: number;
};

export type StoredSettings = {
  v: 1;
  slots: boolean;
  strict: boolean;
};

export const DEFAULT_SETTINGS: StoredSettings = { v: 1, slots: true, strict: false };

const PROGRESS_PREFIX = 'eartype:progress:';
const SETTINGS_KEY = 'eartype:settings';

/** Fired on `window` whenever a progress record changes outside the screen that owns it. */
export const PROGRESS_CHANGED = 'eartype:progress-changed';

// ---------------------------------------------------------------------------
// Pure

const ANSWERED: readonly string[] = ['correct', 'accepted', 'skipped'];

export function answeredCount(stored: StoredProgress): number {
  return Object.keys(stored.outcomes).length;
}

export function toStored(session: Session, segments: readonly Segment[], now = Date.now()): StoredProgress {
  const outcomes: Record<string, Answered> = {};
  session.outcomes.forEach((outcome, index) => {
    const segment = segments[index];
    if (outcome !== 'pending' && segment !== undefined) outcomes[String(segment.startMs)] = outcome;
  });

  return {
    v: 1,
    total: segments.length,
    outcomes,
    currentStartMs: segments[session.index]?.startMs ?? 0,
    updatedAt: now,
  };
}

/** The session the record describes, laid over today's segments, resumed at `resumeIndex`. */
export function fromStored(stored: StoredProgress, segments: readonly Segment[]): Session {
  const session = startSession(segments.length, resumeIndex(stored, segments));
  return {
    ...session,
    outcomes: segments.map((segment) => stored.outcomes[String(segment.startMs)] ?? 'pending'),
  };
}

/**
 * Where to pick up: the segment you were on, unless it is already answered —
 * then the first one still open. A finished video starts at the top.
 */
export function resumeIndex(stored: StoredProgress, segments: readonly Segment[]): number {
  const outcomes = segments.map((segment): SegmentOutcome => stored.outcomes[String(segment.startMs)] ?? 'pending');
  const at = segments.findIndex((segment) => segment.startMs === stored.currentStartMs);
  if (at !== -1 && outcomes[at] === 'pending') return at;

  const pending = firstPending({ total: segments.length, index: 0, outcomes, attempts: 0 });
  return pending ?? 0;
}

/** Validates anything read back — storage and backup files are both untrusted. */
export function parseProgress(value: unknown): StoredProgress | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.v !== 1) return null;
  if (!isCount(record.total) || !isCount(record.currentStartMs) || !isCount(record.updatedAt)) return null;
  if (typeof record.outcomes !== 'object' || record.outcomes === null) return null;

  const outcomes: Record<string, Answered> = {};
  for (const [startMs, outcome] of Object.entries(record.outcomes)) {
    if (!/^\d+$/.test(startMs) || typeof outcome !== 'string' || !ANSWERED.includes(outcome)) return null;
    outcomes[startMs] = outcome as Answered;
  }

  return {
    v: 1,
    total: record.total,
    outcomes,
    currentStartMs: record.currentStartMs,
    updatedAt: record.updatedAt,
  };
}

export function parseSettings(value: unknown): StoredSettings | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.v !== 1 || typeof record.slots !== 'boolean' || typeof record.strict !== 'boolean') return null;
  return { v: 1, slots: record.slots, strict: record.strict };
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

// ---------------------------------------------------------------------------
// Storage

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function read(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw === null || raw === undefined ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or a blocked storage: the run just isn't kept.
  }
}

export function loadProgress(videoId: string): StoredProgress | null {
  return parseProgress(read(PROGRESS_PREFIX + videoId));
}

export function saveProgress(videoId: string, stored: StoredProgress): void {
  write(PROGRESS_PREFIX + videoId, stored);
}

export function clearProgress(videoId: string): void {
  try {
    storage()?.removeItem(PROGRESS_PREFIX + videoId);
  } catch {
    // Nothing to clear if storage is unreachable.
  }
}

export function listProgress(): Record<string, StoredProgress> {
  const all: Record<string, StoredProgress> = {};
  const store = storage();
  if (store === null) return all;

  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key === null || !key.startsWith(PROGRESS_PREFIX)) continue;
      const stored = loadProgress(key.slice(PROGRESS_PREFIX.length));
      if (stored !== null) all[key.slice(PROGRESS_PREFIX.length)] = stored;
    }
  } catch {
    // Partial list is better than none.
  }
  return all;
}

export function loadSettings(): StoredSettings {
  return parseSettings(read(SETTINGS_KEY)) ?? DEFAULT_SETTINGS;
}

export function saveSettings(settings: StoredSettings): void {
  write(SETTINGS_KEY, settings);
}

// ---------------------------------------------------------------------------
// Backup (R-10) — clearing the browser should not cost you every video.

export function exportAll(): string {
  return JSON.stringify({ app: 'eartype', v: 1, progress: listProgress(), settings: loadSettings() }, null, 2);
}

export type ImportResult = { ok: true; count: number } | { ok: false; message: string };

/** Merges a backup in, keeping whichever record of each video is newer. */
export function importAll(json: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, message: 'esse arquivo não é um JSON válido' };
  }

  if (typeof data !== 'object' || data === null) return notOurs();
  const backup = data as Record<string, unknown>;
  if (backup.app !== 'eartype' || backup.v !== 1) return notOurs();
  if (typeof backup.progress !== 'object' || backup.progress === null) return notOurs();

  const incoming: [string, StoredProgress][] = [];
  for (const [videoId, value] of Object.entries(backup.progress)) {
    const stored = parseProgress(value);
    if (stored === null || !/^[\w-]{11}$/.test(videoId)) {
      return { ok: false, message: `o progresso de “${videoId}” no arquivo está corrompido` };
    }
    incoming.push([videoId, stored]);
  }

  let count = 0;
  for (const [videoId, stored] of incoming) {
    const current = loadProgress(videoId);
    if (current !== null && current.updatedAt >= stored.updatedAt) continue;
    saveProgress(videoId, stored);
    count++;
  }

  const settings = parseSettings(backup.settings);
  if (settings !== null) saveSettings(settings);

  return { ok: true, count };
}

function notOurs(): ImportResult {
  return { ok: false, message: 'esse arquivo não é um backup do Eartype' };
}
