/** The switch between the vocabulary's two pages: practice and the word list. */

import Link from 'next/link';

type Page = 'practice' | 'words';

const TABS: { page: Page; href: string; label: string }[] = [
  { page: 'practice', href: '/vocabulary', label: 'Praticar' },
  { page: 'words', href: '/vocabulary/words', label: 'Palavras' },
];

export function VocabularyTabs({ current }: { current: Page }) {
  return (
    <nav className="flex gap-1 self-start rounded-md border border-line bg-surface p-1" aria-label="Vocabulário">
      {TABS.map((tab) => (
        <Link
          key={tab.page}
          href={tab.href}
          aria-current={tab.page === current ? 'page' : undefined}
          className={`rounded-sm px-4 py-1.5 text-sm font-medium ${
            tab.page === current ? 'bg-raised text-fg' : 'text-muted hover:text-accent'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
