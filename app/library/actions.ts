'use server';

/**
 * The two writes the UI can make to the library. Both re-check that writes
 * are allowed and validate their input: a Server Action is a public endpoint,
 * whatever the button that calls it looks like.
 */

import { revalidatePath } from 'next/cache';
import {
  deleteLibraryVideo,
  isVideoId,
  libraryWritable,
  loadLibraryVideo,
  saveLibraryVideo,
} from '@/lib/library/catalog';
import type { CaptionKind, Cue } from '@/types';

export type LibraryActionResult = { ok: true } | { ok: false; message: string };

const READ_ONLY: LibraryActionResult = {
  ok: false,
  message: 'a biblioteca só pode ser alterada rodando o projeto localmente',
};

/** The video's title from YouTube's oEmbed — no API key. `null` if it fails. */
async function fetchTitle(videoId: string): Promise<string | null> {
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`,
    )}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { title?: unknown };
    return typeof body.title === 'string' ? body.title : null;
  } catch {
    return null;
  }
}

function isCue(value: unknown): value is Cue {
  if (typeof value !== 'object' || value === null) return false;
  const cue = value as Record<string, unknown>;
  return (
    typeof cue.startMs === 'number' &&
    typeof cue.endMs === 'number' &&
    typeof cue.text === 'string' &&
    Number.isFinite(cue.startMs) &&
    Number.isFinite(cue.endMs)
  );
}

export async function addToLibrary(input: {
  videoId: string;
  kind: CaptionKind;
  cues: Cue[];
}): Promise<LibraryActionResult> {
  if (!libraryWritable()) return READ_ONLY;
  if (!isVideoId(input?.videoId)) return { ok: false, message: 'videoId inválido' };
  if (!Array.isArray(input.cues) || input.cues.length === 0 || !input.cues.every(isCue)) {
    return { ok: false, message: 'não há legenda válida para salvar' };
  }

  try {
    const title = (await fetchTitle(input.videoId)) ?? input.videoId;
    await saveLibraryVideo({ videoId: input.videoId, title, kind: input.kind, cues: input.cues });
  } catch {
    return { ok: false, message: 'não consegui salvar na biblioteca' };
  }

  revalidatePath('/');
  return { ok: true };
}

export async function removeFromLibrary(videoId: string): Promise<LibraryActionResult> {
  if (!libraryWritable()) return READ_ONLY;
  if (!isVideoId(videoId)) return { ok: false, message: 'videoId inválido' };

  try {
    await deleteLibraryVideo(videoId);
  } catch {
    return { ok: false, message: 'não consegui remover da biblioteca' };
  }

  revalidatePath('/');
  return { ok: true };
}

/**
 * What the practice screen needs to draw its button: whether it may write at
 * all, and whether "add" is really "update".
 */
export async function libraryStatus(
  videoId: string,
): Promise<{ writable: boolean; saved: boolean }> {
  const writable = libraryWritable();
  if (!writable || !isVideoId(videoId)) return { writable, saved: false };
  return { writable, saved: (await loadLibraryVideo(videoId).catch(() => null)) !== null };
}
