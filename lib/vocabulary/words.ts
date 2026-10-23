/**
 * The vocabulary list: built-in words ship in `content/vocabulary/words.json`,
 * and everything you change lives in one overlay record in localStorage —
 * words you added, edits and deletes of built-in ones, and how each word went.
 *
 * Keeping the built-in list out of storage means a new release can grow it
 * without touching what you did with it.
 */

import { read, write } from '@/lib/storage/local';

/** One entry in `words.json`. */
export type BuiltInWord = {
  id: string;
  portuguese: string;
  english: string;
  alternatives: string[];
  category: string;
};

export type Word = BuiltInWord & {
  builtIn: boolean;
  timesRight: number;
  timesWrong: number;
  /** `YYYY-MM-DD`, or `null` if never practiced. */
  lastSeen: string | null;
};

export type WordFields = Pick<Word, 'portuguese' | 'english' | 'alternatives' | 'category'>;

export type WordStats = { right: number; wrong: number; lastSeen: string };

export type Overlay = {
  v: 1;
  added: BuiltInWord[];
  edited: Record<string, Partial<WordFields>>;
  deleted: string[];
  stats: Record<string, WordStats>;
};

export const EMPTY_OVERLAY: Overlay = { v: 1, added: [], edited: {}, deleted: [], stats: {} };

const VOCABULARY_KEY = 'eartype:vocabulary';

// ---------------------------------------------------------------------------
// Pure

/** The list you see: built-in words with your edits, minus deletes, plus yours. */
export function mergeWords(builtIn: readonly BuiltInWord[], overlay: Overlay): Word[] {
  const deleted = new Set(overlay.deleted);
  const withStats = (word: BuiltInWord, isBuiltIn: boolean): Word => {
    const stats = overlay.stats[word.id];
    return {
      ...word,
      builtIn: isBuiltIn,
      timesRight: stats?.right ?? 0,
      timesWrong: stats?.wrong ?? 0,
      lastSeen: stats?.lastSeen ?? null,
    };
  };

  return [
    ...builtIn
      .filter((word) => !deleted.has(word.id))
      .map((word) => withStats({ ...word, ...overlay.edited[word.id] }, true)),
    ...overlay.added.filter((word) => !deleted.has(word.id)).map((word) => withStats(word, false)),
  ];
}

/** Trims every field and drops empty or repeated alternatives. */
export function cleanFields(fields: WordFields): WordFields {
  const english = fields.english.trim();
  const alternatives = [
    ...new Set(fields.alternatives.map((alternative) => alternative.trim()).filter(Boolean)),
  ].filter((alternative) => alternative.toLowerCase() !== english.toLowerCase());
  return {
    portuguese: fields.portuguese.trim(),
    english,
    alternatives,
    category: fields.category.trim(),
  };
}

export function isComplete(fields: WordFields): boolean {
  return fields.portuguese !== '' && fields.english !== '' && fields.category !== '';
}

export function addWord(overlay: Overlay, fields: WordFields, now = Date.now()): Overlay {
  let id = `u_${now}`;
  while (overlay.added.some((word) => word.id === id)) id += '_';
  return { ...overlay, added: [...overlay.added, { id, ...cleanFields(fields) }] };
}

export function editWord(overlay: Overlay, id: string, fields: WordFields): Overlay {
  const clean = cleanFields(fields);
  if (overlay.added.some((word) => word.id === id)) {
    return { ...overlay, added: overlay.added.map((word) => (word.id === id ? { id, ...clean } : word)) };
  }
  return { ...overlay, edited: { ...overlay.edited, [id]: clean } };
}

/** A built-in word goes back to how it ships. */
export function restoreWord(overlay: Overlay, id: string): Overlay {
  const edited = { ...overlay.edited };
  delete edited[id];
  return { ...overlay, edited };
}

export function deleteWord(overlay: Overlay, id: string): Overlay {
  if (overlay.added.some((word) => word.id === id)) {
    const stats = { ...overlay.stats };
    delete stats[id];
    return { ...overlay, added: overlay.added.filter((word) => word.id !== id), stats };
  }
  if (overlay.deleted.includes(id)) return overlay;
  const edited = { ...overlay.edited };
  delete edited[id];
  return { ...overlay, edited, deleted: [...overlay.deleted, id] };
}

export function recordAnswer(overlay: Overlay, id: string, right: boolean, today = isoDate()): Overlay {
  const current = overlay.stats[id] ?? { right: 0, wrong: 0, lastSeen: today };
  return {
    ...overlay,
    stats: {
      ...overlay.stats,
      [id]: {
        right: current.right + (right ? 1 : 0),
        wrong: current.wrong + (right ? 0 : 1),
        lastSeen: today,
      },
    },
  };
}

/**
 * A backup laid over what is here: words merge by id (the backup wins on the
 * same id), deletes add up, and each word keeps whichever stats are newer.
 */
export function mergeOverlays(current: Overlay, incoming: Overlay): Overlay {
  const added = new Map(current.added.map((word) => [word.id, word]));
  for (const word of incoming.added) added.set(word.id, word);

  const stats = { ...current.stats };
  for (const [id, incomingStats] of Object.entries(incoming.stats)) {
    const here = stats[id];
    if (here === undefined || incomingStats.lastSeen > here.lastSeen) stats[id] = incomingStats;
  }

  return {
    v: 1,
    added: [...added.values()],
    edited: { ...current.edited, ...incoming.edited },
    deleted: [...new Set([...current.deleted, ...incoming.deleted])],
    stats,
  };
}

/** Categories in the order they first appear, so the built-in grouping leads. */
export function categoriesOf(words: readonly Pick<Word, 'category'>[]): string[] {
  return [...new Set(words.map((word) => word.category))];
}

/** Today on your calendar, not UTC's — practice at 10 pm is still today. */
export function isoDate(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Validation — storage and backup files are both untrusted.

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function parseBuiltInWord(value: unknown): BuiltInWord | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, portuguese, english, alternatives, category } = value as Record<string, unknown>;
  if (!isString(id) || id === '' || !isString(portuguese) || !isString(english) || !isString(category)) {
    return null;
  }
  if (!isStringList(alternatives)) return null;
  return { id, portuguese, english, alternatives, category };
}

function parseFields(value: unknown): Partial<WordFields> | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const fields: Partial<WordFields> = {};
  for (const key of ['portuguese', 'english', 'category'] as const) {
    if (record[key] === undefined) continue;
    if (!isString(record[key])) return null;
    fields[key] = record[key];
  }
  if (record.alternatives !== undefined) {
    if (!isStringList(record.alternatives)) return null;
    fields.alternatives = record.alternatives;
  }
  return fields;
}

function parseStats(value: unknown): WordStats | null {
  if (typeof value !== 'object' || value === null) return null;
  const { right, wrong, lastSeen } = value as Record<string, unknown>;
  if (!isCount(right) || !isCount(wrong) || !isString(lastSeen) || !DATE.test(lastSeen)) return null;
  return { right, wrong, lastSeen };
}

export function parseOverlay(value: unknown): Overlay | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.v !== 1 || !Array.isArray(record.added) || !isStringList(record.deleted)) return null;
  if (typeof record.edited !== 'object' || record.edited === null) return null;
  if (typeof record.stats !== 'object' || record.stats === null) return null;

  const added: BuiltInWord[] = [];
  for (const entry of record.added) {
    const word = parseBuiltInWord(entry);
    if (word === null) return null;
    added.push(word);
  }

  const edited: Record<string, Partial<WordFields>> = {};
  for (const [id, entry] of Object.entries(record.edited)) {
    const fields = parseFields(entry);
    if (fields === null) return null;
    edited[id] = fields;
  }

  const stats: Record<string, WordStats> = {};
  for (const [id, entry] of Object.entries(record.stats)) {
    const parsed = parseStats(entry);
    if (parsed === null) return null;
    stats[id] = parsed;
  }

  return { v: 1, added, edited, deleted: record.deleted, stats };
}

// ---------------------------------------------------------------------------
// Storage

export function loadOverlay(): Overlay {
  return parseOverlay(read(VOCABULARY_KEY)) ?? EMPTY_OVERLAY;
}

export function saveOverlay(overlay: Overlay): void {
  write(VOCABULARY_KEY, overlay);
}
