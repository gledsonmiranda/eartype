'use client';

/**
 * The numbers on the home cards that only this browser knows: videos you have
 * started, and the word list with your own additions and deletes.
 */

import { useEffect, useState } from 'react';
import { CircleHalf, ListBullets, SquaresFour } from '@phosphor-icons/react';
import { useVocabulary } from '@/app/vocabulary/use-vocabulary';
import { answeredCount, listProgress, PROGRESS_CHANGED } from '@/lib/practice/progress';
import { categoriesOf } from '@/lib/vocabulary/words';

export const CHIP = 'inline-flex items-center gap-1.5 rounded-full bg-raised px-2.5 py-1 text-xs text-muted';

export function InProgressChip() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const refresh = () =>
      setCount(
        Object.values(listProgress()).filter((stored) => {
          const answered = answeredCount(stored);
          return answered > 0 && answered < stored.total;
        }).length,
      );
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener(PROGRESS_CHANGED, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(PROGRESS_CHANGED, refresh);
    };
  }, []);

  if (count === 0) return null;
  return (
    <span className={CHIP}>
      <CircleHalf size={14} weight="bold" aria-hidden="true" />
      {count} em andamento
    </span>
  );
}

export function VocabularyChips() {
  const { words } = useVocabulary();
  const categories = categoriesOf(words).length;

  return (
    <>
      <span className={CHIP}>
        <ListBullets size={14} weight="bold" aria-hidden="true" />
        {words.length} palavras
      </span>
      <span className={CHIP}>
        <SquaresFour size={14} weight="bold" aria-hidden="true" />
        {categories} categorias
      </span>
    </>
  );
}
