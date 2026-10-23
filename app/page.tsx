/** Home: pick what to practice — video dictation or vocabulary. */

import { AppHeader } from '@/app/components/AppHeader';
import { FeatureCards } from '@/app/components/FeatureCards';
import { ProgressBackup } from '@/app/components/ProgressBackup';
import { listLibrary } from '@/lib/library/catalog';

export default async function Home() {
  const entries = await listLibrary();

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-8 px-4 py-12 sm:px-12">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-semibold">O que você quer treinar hoje?</h1>
          <p className="text-sm text-muted">Inglês do jeito que ele é falado, digitando o que você ouve e lembra.</p>
        </div>
        <FeatureCards libraryCount={entries.length} />
        {/* One backup for both features: the file carries videos and vocabulary. */}
        <section
          aria-labelledby="backup-title"
          className="flex flex-col gap-4 rounded-md border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
        >
          <div className="flex flex-col gap-1.5">
            <h2 id="backup-title" className="font-display text-lg font-semibold">
              Seu progresso
            </h2>
            <p className="text-sm leading-relaxed text-muted">
              Fica salvo só neste navegador. Exporte um arquivo com os vídeos e o vocabulário para não perder nada, e
              importe em outro navegador.
            </p>
          </div>
          <div className="shrink-0">
            <ProgressBackup />
          </div>
        </section>
      </main>
    </div>
  );
}
