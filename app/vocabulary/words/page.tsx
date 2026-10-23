/** The word library: every vocabulary word, with search, filters and editing. */

import type { Metadata } from 'next';
import { AppHeader } from '@/app/components/AppHeader';
import { VocabularyTabs } from '@/app/components/VocabularyTabs';
import { VocabularyLibrary } from '@/app/components/VocabularyLibrary';

export const metadata: Metadata = { title: 'Palavras · Eartype' };

export default function VocabularyWordsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader current="vocabulary" />
      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-8 px-4 py-10 sm:px-12">
        <VocabularyTabs current="words" />
        <VocabularyLibrary />
      </main>
    </div>
  );
}
