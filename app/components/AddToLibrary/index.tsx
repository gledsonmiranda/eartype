'use client';

/**
 * Saves the video being practiced — and the captions it came with — to the
 * library, so the next session skips yt-dlp. Draws nothing where the library
 * is read-only.
 */

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { addToLibrary, libraryStatus } from '@/app/library/actions';
import type { CaptionKind, Cue } from '@/types';

export type AddToLibraryProps = {
  videoId: string;
  captionKind: CaptionKind;
  cues: Cue[];
};

type Status = { writable: boolean; saved: boolean };

export function AddToLibrary({ videoId, captionKind, cues }: AddToLibraryProps) {
  const [status, setStatus] = useState<Status | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    libraryStatus(videoId)
      .then((current) => alive && setStatus(current))
      .catch(() => alive && setStatus({ writable: false, saved: false }));
    return () => {
      alive = false;
    };
  }, [videoId]);

  if (status === null || !status.writable) return null;

  if (done) {
    return (
      <Link href="/" className="whitespace-nowrap text-ok underline underline-offset-4">
        na biblioteca ✓
      </Link>
    );
  }

  const save = () =>
    startTransition(async () => {
      setError(null);
      const result = await addToLibrary({ videoId, kind: captionKind, cues });
      if (result.ok) setDone(true);
      else setError(result.message);
    });

  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="rounded-sm border border-line px-2.5 py-1 whitespace-nowrap text-fg hover:border-line-strong disabled:opacity-40"
      >
        {pending ? 'salvando…' : status.saved ? 'atualizar na biblioteca' : 'adicionar à biblioteca'}
      </button>
      {error !== null && <span className="text-warn">{error}</span>}
    </span>
  );
}
