/**
 * The library: videos whose captions ship with the project (content/library).
 * Clicking one goes straight to practice — no yt-dlp, no waiting.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { LibraryCard } from '@/app/components/LibraryCard';
import { libraryWritable, listLibrary } from '@/lib/library/catalog';

export const metadata: Metadata = { title: 'Biblioteca · Eartype' };

export default async function LibraryPage() {
  const entries = await listLibrary();
  const writable = libraryWritable();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <Link href="/" className="text-sm text-zinc-400 underline underline-offset-4">
          ← outro vídeo por URL
        </Link>
        <h1 className="text-2xl font-semibold">Biblioteca</h1>
        <p className="text-sm text-zinc-400">
          Vídeos com legenda já no projeto. Clique em um para começar a praticar.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="text-sm text-zinc-400">
          Nenhum vídeo ainda. Pratique um vídeo por URL e use “adicionar à biblioteca”, ou veja
          content/library/README.md.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <li key={entry.videoId}>
              <LibraryCard videoId={entry.videoId} title={entry.title} deletable={writable} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
