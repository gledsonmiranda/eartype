/**
 * The video library: videos whose captions ship with the project, so practice
 * starts without yt-dlp. Plain files, one folder per video:
 *
 *   content/library/<videoId>/captions.srt   (or .vtt)
 *   content/library/<videoId>/meta.json      { title, kind, addedAt }
 *
 * The folder name *is* the videoId. Server only — it reads the disk. The
 * directory is injectable so tests run against fixtures and temp folders.
 */

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCaptions } from '@/lib/captions/parse-captions';
import { cuesToSrt } from '@/lib/captions/to-srt';
import type { CaptionKind, Cue } from '@/types';

export type LibraryEntry = {
  videoId: string;
  title: string;
  kind: CaptionKind;
  /** `YYYY-MM-DD` — newest first on the list. */
  addedAt: string;
};

export type LibraryVideo = { entry: LibraryEntry; cues: Cue[] };

export const DEFAULT_LIBRARY_DIR = join(process.cwd(), 'content', 'library');

/** Same alphabet as `parse-url`, and the only thing allowed into a path here. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CAPTION_FILES = ['captions.srt', 'captions.vtt'];

export function isVideoId(value: unknown): value is string {
  return typeof value === 'string' && VIDEO_ID.test(value);
}

function assertVideoId(videoId: string): void {
  if (!isVideoId(videoId)) throw new Error(`videoId inválido: ${JSON.stringify(videoId)}`);
}

/**
 * Writes touch files in the repo, so they are a local-dev thing: a deployed
 * build has nowhere to write, and the buttons that call them stay hidden.
 */
export function libraryWritable(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.LIBRARY_WRITABLE === '1';
}

function parseMeta(videoId: string, raw: string): LibraryEntry | null {
  let meta: unknown;
  try {
    meta = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof meta !== 'object' || meta === null) return null;

  const { title, kind, addedAt } = meta as Record<string, unknown>;
  if (typeof title !== 'string' || title.trim() === '') return null;
  if (kind !== 'manual' && kind !== 'asr') return null;
  if (typeof addedAt !== 'string') return null;

  return { videoId, title: title.trim(), kind, addedAt };
}

async function readEntry(dir: string, videoId: string): Promise<LibraryEntry | null> {
  try {
    return parseMeta(videoId, await readFile(join(dir, videoId, 'meta.json'), 'utf8'));
  } catch {
    return null; // No meta.json: not a library entry.
  }
}

/** Every valid entry, newest first. Broken folders are skipped, not fatal. */
export async function listLibrary(dir = DEFAULT_LIBRARY_DIR): Promise<LibraryEntry[]> {
  let names: string[];
  try {
    const found = await readdir(dir, { withFileTypes: true });
    names = found.filter((item) => item.isDirectory() && isVideoId(item.name)).map((item) => item.name);
  } catch {
    return []; // No library folder yet.
  }

  const entries = await Promise.all(names.map((videoId) => readEntry(dir, videoId)));
  return entries
    .filter((entry): entry is LibraryEntry => entry !== null)
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.title.localeCompare(b.title));
}

/** The entry and its parsed cues, or `null` when the id is not in the library. */
export async function loadLibraryVideo(
  videoId: string,
  dir = DEFAULT_LIBRARY_DIR,
): Promise<LibraryVideo | null> {
  if (!isVideoId(videoId)) return null;

  const entry = await readEntry(dir, videoId);
  if (entry === null) return null;

  for (const file of CAPTION_FILES) {
    let raw: string;
    try {
      raw = await readFile(join(dir, videoId, file), 'utf8');
    } catch {
      continue;
    }
    return { entry, cues: parseCaptions(raw).cues };
  }

  return null;
}

export type SaveInput = {
  videoId: string;
  title: string;
  kind: CaptionKind;
  cues: Cue[];
};

/** Creates or replaces an entry. Re-adding a video refreshes its captions. */
export async function saveLibraryVideo(
  input: SaveInput,
  dir = DEFAULT_LIBRARY_DIR,
  now: () => Date = () => new Date(),
): Promise<LibraryEntry> {
  assertVideoId(input.videoId);
  if (input.cues.length === 0) throw new Error('não há legenda para salvar');

  const entry: LibraryEntry = {
    videoId: input.videoId,
    title: input.title.trim() || input.videoId,
    kind: input.kind === 'asr' ? 'asr' : 'manual',
    addedAt: now().toISOString().slice(0, 10),
  };

  const folder = join(dir, input.videoId);
  await mkdir(folder, { recursive: true });
  // A stale .vtt would win over nothing but confuse whoever reads the folder.
  await rm(join(folder, 'captions.vtt'), { force: true });
  await writeFile(join(folder, 'captions.srt'), cuesToSrt(input.cues), 'utf8');
  const meta = { title: entry.title, kind: entry.kind, addedAt: entry.addedAt };
  await writeFile(join(folder, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  return entry;
}

export async function deleteLibraryVideo(videoId: string, dir = DEFAULT_LIBRARY_DIR): Promise<void> {
  assertVideoId(videoId);
  await rm(join(dir, videoId), { recursive: true, force: true });
}
