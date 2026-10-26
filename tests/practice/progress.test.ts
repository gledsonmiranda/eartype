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
  loadSize,
  parseProgress,
  remapSession,
  resumeIndex,
  saveProgress,
  saveSettings,
  saveSize,
  toStored,
  type StoredProgress,
} from '@/lib/practice/progress';
import { goTo, recordOutcome, startSession } from '@/lib/practice/session';
import { addWord, EMPTY_OVERLAY, loadOverlay, recordAnswer, saveOverlay } from '@/lib/vocabulary/words';
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

  it('keeps the segment size per video, long being the same as nothing saved', () => {
    expect(loadSize(VIDEO)).toBeNull();
    saveSize(VIDEO, 'short');
    expect(loadSize(VIDEO)).toBe('short');
    saveSize(VIDEO, 'long');
    expect(loadSize(VIDEO)).toBeNull();
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
    expect(importAll(backup)).toEqual({ ok: true, count: 1, vocabulary: true });
    expect(loadProgress(VIDEO)?.outcomes).toEqual({ '0': 'correct' });
    expect(loadSettings().slots).toBe(false);
  });

  it('carries the vocabulary in the backup and merges it in', () => {
    let overlay = addWord(EMPTY_OVERLAY, { portuguese: 'chave', english: 'key', alternatives: [], category: 'Casa' }, 1);
    overlay = recordAnswer(overlay, 'w_0001', true, '2026-10-01');
    saveOverlay(overlay);
    const backup = exportAll();

    items.clear();
    saveOverlay(recordAnswer(EMPTY_OVERLAY, 'w_0002', false, '2026-10-02'));
    importAll(backup);

    const merged = loadOverlay();
    expect(merged.added.map((word) => word.english)).toEqual(['key']);
    expect(Object.keys(merged.stats).sort()).toEqual(['w_0001', 'w_0002']);
  });

  it('refuses a backup whose vocabulary is corrupt', () => {
    const backup = JSON.stringify({ app: 'eartype', v: 1, progress: {}, vocabulary: { v: 1, added: 'nope' } });
    expect(importAll(backup)).toMatchObject({ ok: false });
  });

  it('keeps the newer record when both sides have the video', () => {
    saveProgress(VIDEO, stored({ outcomes: { '0': 'correct' }, updatedAt: 200 }));
    const older = JSON.stringify({
      app: 'eartype',
      v: 1,
      progress: { [VIDEO]: stored({ outcomes: { '0': 'skipped' }, updatedAt: 100 }) },
    });

    expect(importAll(older)).toEqual({ ok: true, count: 0, vocabulary: false });
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

describe('remapSession', () => {
  /** Segments by `[startSec, endSec]`. */
  const cut = (...ranges: [number, number][]): Segment[] =>
    ranges.map(([start, end], index) => ({
      index,
      startMs: start * 1000,
      endMs: end * 1000,
      referenceText: `segment ${index}`,
      sourceCueIds: [],
    }));

  const long = cut([0, 8], [8, 16]);
  const short = cut([0, 4], [4, 8], [8, 12], [12, 16]);

  it('marks the pieces of an answered segment as answered', () => {
    const session = recordOutcome(startSession(2), 'correct');
    expect(remapSession(session, long, short).outcomes).toEqual(['correct', 'correct', 'pending', 'pending']);
  });

  it('leaves a longer segment pending until every part of it is answered', () => {
    let session = recordOutcome(startSession(4), 'correct');
    session = recordOutcome(goTo(session, 2), 'correct');
    session = recordOutcome(goTo(session, 3), 'accepted');
    expect(remapSession(session, short, long).outcomes).toEqual(['pending', 'accepted']);
  });

  it('ignores a neighbour it only grazes', () => {
    const shifted = cut([0, 8.2], [8.2, 16]);
    const session = recordOutcome(startSession(2), 'skipped');
    expect(remapSession(session, long, shifted).outcomes).toEqual(['skipped', 'pending']);
  });

  it('stays on the segment holding the start of the current one', () => {
    const session = goTo(startSession(4), 3);
    const back = remapSession(session, short, long);
    expect(back.index).toBe(1);
    expect(back.total).toBe(2);
    expect(back.attempts).toBe(0);
  });
});

describe('segment size', () => {
  it('rides along in the progress record, so a backup lands on the right cut', () => {
    const session = recordOutcome(startSession(3), 'correct');
    const saved = toStored(session, segmentsAt(0, 4000, 8000), 1, 'medium');
    expect(saved.size).toBe('medium');
    expect(parseProgress(saved)?.size).toBe('medium');
    expect(toStored(session, segmentsAt(0, 4000, 8000), 1)).not.toHaveProperty('size');
    expect(parseProgress({ ...saved, size: 'huge' })).not.toHaveProperty('size');
  });
});
