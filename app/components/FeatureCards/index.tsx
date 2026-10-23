/**
 * The home's two ways in. Each card is one link to its feature; the header
 * buttons go to the same places.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, BookOpenText, FilmStrip, Play } from '@phosphor-icons/react/dist/ssr';
import { CHIP, InProgressChip, VocabularyChips } from './LiveCounts';

function FeatureCard({
  href,
  icon,
  title,
  description,
  action,
  children,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  action: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-4 rounded-md border border-line bg-surface p-6 hover:border-accent sm:p-8"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-md bg-raised text-accent">{icon}</span>
      <span className="flex flex-col gap-1.5">
        <span className="font-display text-lg font-semibold text-fg">{title}</span>
        <span className="text-sm leading-relaxed text-muted">{description}</span>
      </span>
      <span className="flex flex-wrap gap-1.5">{children}</span>
      <span className="mt-auto flex items-center gap-1.5 pt-2 text-sm font-medium text-fg group-hover:text-accent">
        {action}
        <ArrowRight size={16} weight="bold" aria-hidden="true" />
      </span>
    </Link>
  );
}

export function FeatureCards({ libraryCount }: { libraryCount: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <FeatureCard
        href="/videos"
        icon={<Play size={22} weight="bold" aria-hidden="true" />}
        title="Ditado com vídeos"
        description="O vídeo do YouTube toca em trechos curtos, pausa, e você digita o que ouviu."
        action="Abrir vídeos"
      >
        <span className={CHIP}>
          <FilmStrip size={14} weight="bold" aria-hidden="true" />
          {libraryCount} {libraryCount === 1 ? 'vídeo na biblioteca' : 'vídeos na biblioteca'}
        </span>
        <InProgressChip />
      </FeatureCard>

      <FeatureCard
        href="/vocabulary"
        icon={<BookOpenText size={22} weight="bold" aria-hidden="true" />}
        title="Vocabulário"
        description="Uma palavra em português aparece, você digita em inglês e vê na hora se acertou."
        action="Abrir vocabulário"
      >
        <VocabularyChips />
      </FeatureCard>
    </div>
  );
}
