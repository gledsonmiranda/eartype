'use client';

/**
 * One video in the library: thumbnail and title, the whole card a link to
 * practice. The delete button asks first, on the card itself — removing an
 * entry deletes its captions from disk.
 *
 * How far you got is read from this browser after mount (RF-07): a bar along
 * the thumbnail and a count under the title.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { Check, Trash } from '@phosphor-icons/react';
import { removeFromLibrary } from '@/app/library/actions';
import {
  answeredCount,
  clearProgress,
  loadProgress,
  PROGRESS_CHANGED,
  type StoredProgress,
} from '@/lib/practice/progress';

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
  const [progress, setProgress] = useState<StoredProgress | null>(null);

  useEffect(() => {
    const refresh = () => setProgress(loadProgress(videoId));
    refresh();
    // An import on this page, or practice in another tab.
    window.addEventListener(PROGRESS_CHANGED, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(PROGRESS_CHANGED, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [videoId]);

  const remove = () =>
    startTransition(async () => {
      const result = await removeFromLibrary(videoId);
      if (result.ok) clearProgress(videoId);
      else setError(result.message);
    });

  const answered = progress === null ? 0 : answeredCount(progress);
  const total = progress?.total ?? 0;
  const finished = total > 0 && answered >= total;

  return (
    <article className="relative overflow-hidden rounded-md border border-line bg-surface hover:border-line-strong">
      <Link href={`/library/${videoId}`} className="flex flex-col">
        <div className="relative">
          <Image
            src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
            alt=""
            width={480}
            height={360}
            className="aspect-video w-full object-cover"
          />
          {answered > 0 && total > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-bg/60">
              <div className="h-full bg-accent" style={{ width: `${Math.min(100, (answered / total) * 100)}%` }} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 p-4">
          <h2 className="text-base font-semibold text-fg">{title}</h2>
          {answered > 0 && (
            <span className="font-mono text-xs text-muted">
              {finished ? (
                <span className="inline-flex items-center gap-1">
                  <Check size={12} weight="bold" aria-hidden="true" />
                  concluído
                </span>
              ) : (
                `${answered} / ${total}`
              )}
            </span>
          )}
        </div>
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
          <Trash size={16} weight="bold" aria-hidden="true" />
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
