'use client';

/**
 * The transcript, alongside the practice column.
 *
 * Every line starts blurred — the panel is the answer sheet, and reading it
 * defeats the exercise (R-04). A line clears when you answer its segment, so
 * the panel fills in as you go and the progress becomes something you can see
 * rather than a counter in the footer.
 *
 * The blur is a discipline aid, not a lock: anyone can flip the switch in the
 * header, and that is on purpose — reading along is a legitimate way to use a
 * hard video.
 */

import { useEffect, useRef } from 'react';
import { isRevealed, type SegmentOutcome } from '@/lib/practice/session';
import type { Segment } from '@/types';

export type TranscriptPanelProps = {
  segments: Segment[];
  outcomes: readonly SegmentOutcome[];
  currentIndex: number;
  showAll: boolean;
  onToggleShowAll: () => void;
  onSelect: (index: number) => void;
};

const MARKERS: Record<SegmentOutcome, { label: string; className: string }> = {
  pending: { label: '', className: 'text-zinc-600' },
  correct: { label: '✓', className: 'text-emerald-400' },
  accepted: { label: '~', className: 'text-amber-400' },
  skipped: { label: '·', className: 'text-zinc-500' },
};

function timestamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function TranscriptPanel({
  segments,
  outcomes,
  currentIndex,
  showAll,
  onToggleShowAll,
  onSelect,
}: TranscriptPanelProps) {
  const current = useRef<HTMLLIElement>(null);

  useEffect(() => {
    current.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentIndex]);

  return (
    <aside className="flex min-h-0 flex-col rounded-lg border border-zinc-800">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <h2 className="text-xs tracking-wide text-zinc-400 uppercase">legenda</h2>
        <button
          type="button"
          onClick={onToggleShowAll}
          aria-pressed={showAll}
          className="rounded-full border border-zinc-600 px-3 py-1 text-xs text-zinc-200 hover:border-zinc-400"
        >
          {showAll ? 'esconder' : 'mostrar tudo'}
        </button>
      </header>

      <ol className="min-h-0 flex-1 overflow-y-auto">
        {segments.map((segment, index) => {
          const outcome = outcomes[index] ?? 'pending';
          const revealed = isRevealed(outcome, showAll);
          const isCurrent = index === currentIndex;
          const marker = MARKERS[outcome];

          return (
            // `relative` contains the sr-only span below: absolutely positioned
            // with no positioned ancestor, it would hang off the initial
            // containing block, escape the list's scroll clip, and stretch the
            // page into a second scrollbar next to the panel's own.
            <li key={segment.index} ref={isCurrent ? current : null} className="relative">
              <button
                type="button"
                onClick={() => onSelect(index)}
                // Reading is opt-in; tabbing through 279 lines is not.
                tabIndex={-1}
                className={`flex w-full gap-2 border-l-2 px-3 py-2 text-left text-sm ${
                  isCurrent
                    ? 'border-zinc-300 bg-zinc-800/60'
                    : 'border-transparent hover:bg-zinc-900/60'
                }`}
              >
                <span className="flex w-10 shrink-0 justify-between font-mono text-[11px] text-zinc-500">
                  <span className={marker.className}>{marker.label}</span>
                  <span>{timestamp(segment.startMs)}</span>
                </span>
                <span
                  className={`font-mono leading-snug transition-[filter,opacity] duration-300 ${
                    revealed ? 'text-zinc-200' : 'text-zinc-400 opacity-70 blur-[5px] select-none'
                  }`}
                  aria-hidden={!revealed}
                >
                  {segment.referenceText}
                </span>
                {!revealed && <span className="sr-only">trecho ainda não praticado</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
