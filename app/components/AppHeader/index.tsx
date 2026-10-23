/**
 * The top bar of every page outside practice: the logo goes home, and the two
 * features are always one click away. The one you are in is marked.
 */

import Link from 'next/link';
import { BookOpenText, Play } from '@phosphor-icons/react/dist/ssr';

export type Feature = 'videos' | 'vocabulary';

const FEATURES = [
  { feature: 'videos', href: '/videos', label: 'Vídeos', Icon: Play },
  { feature: 'vocabulary', href: '/vocabulary', label: 'Vocabulário', Icon: BookOpenText },
] as const;

export function AppHeader({ current }: { current?: Feature }) {
  return (
    <header className="flex h-[72px] items-center gap-3 border-b border-line-soft px-4 sm:px-12">
      <Link href="/" className="flex items-center gap-3 hover:text-accent" aria-label="eartype — início">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden="true">
          <path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0" />
          <path d="M12 9a1.5 1.5 0 0 1 1.5 1.5" />
        </svg>
        <span className="font-display text-[22px] font-bold tracking-tight">eartype</span>
      </Link>

      <nav className="ml-auto flex gap-2" aria-label="Funcionalidades">
        {FEATURES.map(({ feature, href, label, Icon }) => {
          const active = feature === current;
          return (
            <Link
              key={feature}
              href={href}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              title={label}
              className={`flex h-10 min-w-10 items-center justify-center gap-2 rounded-sm border px-3 text-sm font-medium sm:px-4 ${
                active ? 'border-accent bg-raised text-accent' : 'border-line bg-surface text-fg hover:border-accent hover:text-accent'
              }`}
            >
              <Icon size={18} weight="bold" aria-hidden="true" />
              {/* On a phone the icons carry it. */}
              <span className="hidden sm:inline">{label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
