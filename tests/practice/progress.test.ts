import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearProgress,
  DEFAULT_SETTINGS,
  exportAll,
  fromStored,
  importAll,
  listProgress,
  loadProgress,
  loadSettings,
  parseProgress,
  resumeIndex,
  saveProgress,
  saveSettings,
  toStored,
  type StoredProgress,
} from '@/lib/practice/progress';
import { goTo, recordOutcome, startSession } from '@/lib/practice/session';
import type { Segment } from '@/types';

const VIDEO = 'dQw4w9WgXcQ';

function segmentsAt(...starts: number[]): Segment[] {
  return starts.map((startMs, index) => ({
    index,
    startMs,
    endMs: startMs + 3000,
    referenceText: `segment ${index}`,
    sourceCueIds: [],
  }));
}

function stored(overrides: Partial<StoredProgress> = {}): StoredProgress {
  return { v: 1, total: 3, outcomes: {}, currentStartMs: 0, updatedAt: 1, ...overrides };
}

describe('toStored / fromStored', () => {
  const segments = segmentsAt(0, 4000, 8000);

  it('round-trips the answered segments and where you were', () => {
    let session = recordOutcome(startSession(3), 'correct');
    session = goTo(session, 1);
    session = recordOutcome(session, 'skipped');
    session = goTo(session, 2);

    const saved = toStored(session, segments, 42);
    expect(saved).toEqual({
      v: 1,
      total: 3,
      outcomes: { '0': 'correct', '4000': 'skipped' },
      currentStartMs: 8000,
      updatedAt: 42,
    });

    const back = fromStored(saved, segments);
    expect(back.outcomes).toEqual(['correct', 'skipped', 'pending']);
    expect(back.index).toBe(2);
    expect(back.attempts).toBe(0);
  });

  it('keeps outcomes whose start still lines up after segmenting again', () => {
    const saved = stored({ outcomes: { '0': 'correct', '4000': 'accepted' }, currentStartMs: 8000 });
    const regrouped = segmentsAt(0, 6000, 8000, 12000);

    expect(fromStored(saved, regrouped).outcomes).toEqual(['correct', 'pending', 'pending', 'pending']);
  });
});

describe('resumeIndex', () => {
  const segments = segmentsAt(0, 4000, 8000);

  it('returns to the segment you were on when it is still open', () => {
    expect(resumeIndex(stored({ outcomes: { '0': 'correct' }, currentStartMs: 4000 }), segments)).toBe(1);
  });

  it('moves to the first open segment when the current one was answered', () => {
    const saved = stored({ outcomes: { '4000': 'correct', '8000': 'correct' }, currentStartMs: 8000 });
    expect(resumeIndex(saved, segments)).toBe(0);
  });

  it('falls back to the first open segment when the current one no longer exists', () => {
    expect(resumeIndex(stored({ outcomes: { '0': 'correct' }, currentStartMs: 999 }), segments)).toBe(1);
  });

  it('starts at the top of a finished video', () => {
    const saved = stored({ outcomes: { '0': 'correct', '4000': 'correct', '8000': 'skipped' } });
    expect(resumeIndex(saved, segments)).toBe(0);
  });
});

describe('parseProgress', () => {
  it('rejects records from another version or with a bad shape', () => {
    expect(parseProgress(null)).toBeNull();
    expect(parseProgress({ ...stored(), v: 2 })).toBeNull();
    expect(parseProgress({ ...stored(), outcomes: { '0': 'pending' } })).toBeNull();
    expect(parseProgress({ ...stored(), outcomes: { abc: 'correct' } })).toBeNull();
    expect(parseProgress({ ...stored(), total: -1 })).toBeNull();
  });
});

describe('storage', () => {
  let items: Map<string, string>;

  beforeEach(() => {
    items = new Map();
    const stub: Storage = {
      get length() {
        return items.size;
      },
      key: (index) => [...items.keys()][index] ?? null,
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => void items.set(key, value),
      removeItem: (key) => void items.delete(key),
      clear: () => items.clear(),
    };
    Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('saves, loads, lists and clears a video', () => {
    saveProgress(VIDEO, stored({ outcomes: { '0': 'correct' } }));

    expect(loadProgress(VIDEO)?.outcomes).toEqual({ '0': 'correct' });
    expect(Object.keys(listProgress())).toEqual([VIDEO]);

    clearProgress(VIDEO);
    expect(loadProgress(VIDEO)).toBeNull();
  });

  it('treats corrupt JSON as nothing saved', () => {
    items.set(`eartype:progress:${VIDEO}`, '{not json');
    expect(loadProgress(VIDEO)).toBeNull();
  });

  it('falls back to the default settings', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    saveSettings({ v: 1, slots: false, strict: true });
    expect(loadSettings()).toEqual({ v: 1, slots: false, strict: true });
  });

  it('exports and imports everything back', () => {
    saveProgress(VIDEO, stored({ outcomes: { '0': 'correct' } }));
    saveSettings({ v: 1, slots: false, strict: false });
    const backup = exportAll();

    items.clear();
    expect(importAll(backup)).toEqual({ ok: true, count: 1 });
    expect(loadProgress(VIDEO)?.outcomes).toEqual({ '0': 'correct' });
    expect(loadSettings().slots).toBe(false);
  });

  it('keeps the newer record when both sides have the video', () => {
    saveProgress(VIDEO, stored({ outcomes: { '0': 'correct' }, updatedAt: 200 }));
    const older = JSON.stringify({
      app: 'eartype',
      v: 1,
      progress: { [VIDEO]: stored({ outcomes: { '0': 'skipped' }, updatedAt: 100 }) },
    });

    expect(importAll(older)).toEqual({ ok: true, count: 0 });
    expect(loadProgress(VIDEO)?.outcomes).toEqual({ '0': 'correct' });
  });

  it('refuses files that are not an Eartype backup', () => {
    expect(importAll('nope')).toMatchObject({ ok: false });
    expect(importAll('{"hello":1}')).toMatchObject({ ok: false });
    expect(
      importAll(JSON.stringify({ app: 'eartype', v: 1, progress: { [VIDEO]: { v: 9 } } })),
    ).toMatchObject({ ok: false });
    expect(loadProgress(VIDEO)).toBeNull();
  });
});
