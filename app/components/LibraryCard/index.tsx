'use client';

/**
 * One video in the library: thumbnail and title, the whole card a link to
 * practice. The delete button asks first, on the card itself — removing an
 * entry deletes its captions from disk.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { removeFromLibrary } from '@/app/library/actions';

export type LibraryCardProps = {
  videoId: string;
  title: string;
  /** False on a deployed build, where the library is read-only. */
  deletable: boolean;
};

export function LibraryCard({ videoId, title, deletable }: LibraryCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      const result = await removeFromLibrary(videoId);
      if (!result.ok) setError(result.message);
    });

  return (
    <article className="relative overflow-hidden rounded-md border border-line bg-surface hover:border-line-strong">
      <Link href={`/library/${videoId}`} className="flex flex-col">
        <Image
          src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
          alt=""
          width={480}
          height={360}
          className="aspect-video w-full object-cover"
        />
        <h2 className="p-4 text-base font-semibold text-fg">{title}</h2>
      </Link>

      {deletable && !confirming && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          aria-label={`remover ${title} da biblioteca`}
          title="remover da biblioteca"
          className="absolute top-2 right-2 rounded-sm bg-bg/80 p-2 text-muted hover:text-bad"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {confirming && (
        <div
          role="alertdialog"
          aria-label="confirmar remoção"
          className="absolute inset-0 flex flex-col justify-center gap-3 bg-bg/95 p-4 text-sm"
        >
          <p className="text-fg">
            Remover “{title}” da biblioteca? Isso apaga a legenda do disco.
          </p>
          {error !== null && <p className="text-warn">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              autoFocus
              className="rounded-sm bg-bad px-4 py-1.5 font-medium text-bg disabled:opacity-40"
            >
              {pending ? 'removendo…' : 'remover'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-sm border border-line px-4 py-1.5 text-fg"
            >
              cancelar
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
