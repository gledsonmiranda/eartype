/** Vocabulary practice: a Portuguese word on screen, the English typed back. */

import type { Metadata } from 'next';
import { AppHeader } from '@/app/components/AppHeader';
import { VocabularyTabs } from '@/app/components/VocabularyTabs';
import { VocabularyPractice } from '@/app/components/VocabularyPractice';

export const metadata: Metadata = { title: 'Vocabulário · Eartype' };

export default function VocabularyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader current="vocabulary" />
      <main className="mx-auto flex w-full max-w-[880px] flex-col gap-8 px-4 py-10 sm:px-12">
        <VocabularyTabs current="practice" />
        <VocabularyPractice />
      </main>
    </div>
  );
}
