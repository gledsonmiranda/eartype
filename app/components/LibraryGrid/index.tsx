/**
 * The library's cards. Rendered on the server — it only lays out entries the
 * page already read from disk; each card is its own client island.
 */

import { LibraryCard } from '@/app/components/LibraryCard';
import { ProgressBackup } from '@/app/components/ProgressBackup';
import type { LibraryEntry } from '@/lib/library/catalog';

export type LibraryGridProps = {
  entries: LibraryEntry[];
  /** False on a deployed build, where the library is read-only. */
  writable: boolean;
};

export function LibraryGrid({ entries, writable }: LibraryGridProps) {
  return (
    <div className="flex flex-col gap-4">
      {entries.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-strong p-6 text-sm text-muted">
          Nenhum vídeo ainda. Comece um vídeo novo abaixo e use “adicionar à biblioteca” na tela de
          prática — da próxima vez ele abre direto daqui.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <li key={entry.videoId}>
              <LibraryCard videoId={entry.videoId} title={entry.title} deletable={writable} />
            </li>
          ))}
        </ul>
      )}
      <ProgressBackup />
    </div>
  );
}
