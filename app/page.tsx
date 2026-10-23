/** Home: pick what to practice — video dictation or vocabulary. */

import { AppHeader } from '@/app/components/AppHeader';
import { FeatureCards } from '@/app/components/FeatureCards';
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
      </main>
    </div>
  );
}
