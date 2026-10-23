import { describe, expect, it } from 'vitest';
import {
  addWord,
  categoriesOf,
  deleteWord,
  editWord,
  EMPTY_OVERLAY,
  mergeOverlays,
  mergeWords,
  parseOverlay,
  recordAnswer,
  restoreWord,
  type BuiltInWord,
} from '@/lib/vocabulary/words';

const builtIn: BuiltInWord[] = [
  { id: 'w_0001', portuguese: 'sofá', english: 'sofa', alternatives: ['couch'], category: 'Móveis' },
  { id: 'w_0002', portuguese: 'garfo', english: 'fork', alternatives: [], category: 'Cozinha' },
];

const lampFields = { portuguese: ' abajur ', english: ' lamp ', alternatives: ['light', ' ', 'lamp', 'light'], category: 'Móveis' };

describe('mergeWords', () => {
  it('starts with the built-in list and no stats', () => {
    const words = mergeWords(builtIn, EMPTY_OVERLAY);
    expect(words.map((word) => word.english)).toEqual(['sofa', 'fork']);
    expect(words[0]).toMatchObject({ builtIn: true, timesRight: 0, timesWrong: 0, lastSeen: null });
  });

  it('adds yours, cleaned up, after the built-in ones', () => {
    const overlay = addWord(EMPTY_OVERLAY, lampFields, 42);
    const words = mergeWords(builtIn, overlay);
    expect(words[2]).toMatchObject({
      id: 'u_42',
      portuguese: 'abajur',
      english: 'lamp',
      alternatives: ['light'],
      builtIn: false,
    });
  });

  it('never reuses an id', () => {
    const overlay = addWord(addWord(EMPTY_OVERLAY, lampFields, 1), lampFields, 1);
    expect(new Set(overlay.added.map((word) => word.id)).size).toBe(2);
  });

  it('edits a built-in word, and restores it', () => {
    const fields = { ...builtIn[1], english: 'table fork' };
    const edited = editWord(EMPTY_OVERLAY, 'w_0002', fields);
    expect(mergeWords(builtIn, edited)[1].english).toBe('table fork');
    expect(mergeWords(builtIn, restoreWord(edited, 'w_0002'))[1].english).toBe('fork');
  });

  it('edits one of yours in place', () => {
    const added = addWord(EMPTY_OVERLAY, lampFields, 7);
    const edited = editWord(added, 'u_7', { ...lampFields, english: 'table lamp' });
    expect(edited.edited).toEqual({});
    expect(mergeWords(builtIn, edited)[2].english).toBe('table lamp');
  });

  it('deletes built-in words and yours', () => {
    let overlay = addWord(EMPTY_OVERLAY, lampFields, 7);
    overlay = recordAnswer(overlay, 'u_7', true);
    overlay = deleteWord(overlay, 'u_7');
    overlay = deleteWord(overlay, 'w_0001');

    expect(mergeWords(builtIn, overlay).map((word) => word.id)).toEqual(['w_0002']);
    expect(overlay.added).toEqual([]);
    expect(overlay.stats).toEqual({});
  });

  it('records answers into the stats', () => {
    let overlay = recordAnswer(EMPTY_OVERLAY, 'w_0001', true, '2026-10-01');
    overlay = recordAnswer(overlay, 'w_0001', false, '2026-10-02');
    expect(mergeWords(builtIn, overlay)[0]).toMatchObject({ timesRight: 1, timesWrong: 1, lastSeen: '2026-10-02' });
  });
});

describe('mergeOverlays', () => {
  it('keeps the newer stats and every word and delete', () => {
    const here = deleteWord(recordAnswer(EMPTY_OVERLAY, 'w_0001', true, '2026-10-05'), 'w_0002');
    const backup = addWord(recordAnswer(EMPTY_OVERLAY, 'w_0001', false, '2026-10-01'), lampFields, 9);

    const merged = mergeOverlays(here, backup);
    expect(merged.stats.w_0001).toEqual({ right: 1, wrong: 0, lastSeen: '2026-10-05' });
    expect(merged.deleted).toEqual(['w_0002']);
    expect(merged.added.map((word) => word.id)).toEqual(['u_9']);
  });
});

describe('parseOverlay', () => {
  it('round-trips a valid overlay', () => {
    const overlay = recordAnswer(editWord(addWord(EMPTY_OVERLAY, lampFields, 1), 'w_0001', builtIn[0]), 'u_1', true);
    expect(parseOverlay(JSON.parse(JSON.stringify(overlay)))).toEqual(overlay);
  });

  it('rejects anything malformed', () => {
    expect(parseOverlay(null)).toBeNull();
    expect(parseOverlay({ ...EMPTY_OVERLAY, v: 2 })).toBeNull();
    expect(parseOverlay({ ...EMPTY_OVERLAY, added: [{ id: 'x' }] })).toBeNull();
    expect(parseOverlay({ ...EMPTY_OVERLAY, edited: { w_0001: { english: 3 } } })).toBeNull();
    expect(parseOverlay({ ...EMPTY_OVERLAY, stats: { w_0001: { right: -1, wrong: 0, lastSeen: '2026-10-01' } } })).toBeNull();
    expect(parseOverlay({ ...EMPTY_OVERLAY, stats: { w_0001: { right: 1, wrong: 0, lastSeen: 'yesterday' } } })).toBeNull();
  });
});

describe('categoriesOf', () => {
  it('lists categories in order of first appearance', () => {
    expect(categoriesOf([...builtIn, builtIn[0]])).toEqual(['Móveis', 'Cozinha']);
  });
});
