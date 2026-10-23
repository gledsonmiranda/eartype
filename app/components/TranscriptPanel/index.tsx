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

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy } from '@phosphor-icons/react';
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

const MARKERS: Record<SegmentOutcome, { label: ReactNode; className: string }> = {
  pending: { label: '', className: 'text-dim' },
  correct: { label: <Check size={14} weight="bold" className="inline" aria-hidden="true" />, className: 'text-ok' },
  accepted: { label: '~', className: 'text-warn' },
  skipped: { label: '·', className: 'text-dim' },
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
    <aside className="flex max-h-96 min-h-0 flex-col border-t border-line-soft bg-sidebar lg:max-h-none lg:border-t-0 lg:border-l">
      <header className="flex h-14 items-center justify-between gap-2 border-b border-line-soft px-5">
        <h2 className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">Legenda</h2>
        <button
          type="button"
          onClick={onToggleShowAll}
          aria-pressed={showAll}
          className="h-9 rounded-sm border border-line px-3.5 text-[13px] text-fg hover:border-line-strong"
        >
          {showAll ? 'Esconder' : 'Mostrar tudo'}
        </button>
      </header>

      <ol className="min-h-0 flex-1 overflow-y-auto py-2">
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
                className={`flex w-full gap-3 border-l-[3px] py-3 pl-5 text-left text-sm ${revealed ? 'pr-12' : 'pr-5'} ${
                  isCurrent
                    ? 'border-accent bg-raised'
                    : 'border-transparent hover:bg-surface'
                }`}
              >
                <span className="flex w-12 shrink-0 justify-between font-mono text-xs text-dim">
                  <span className={marker.className}>{marker.label}</span>
                  <span>{timestamp(segment.startMs)}</span>
                </span>
                <span
                  className={`font-mono leading-snug transition-[filter,opacity] duration-300 ${
                    revealed ? 'text-fg' : 'text-muted opacity-70 blur-[5px] select-none'
                  }`}
                  aria-hidden={!revealed}
                >
                  {segment.referenceText}
                </span>
                {!revealed && <span className="sr-only">trecho ainda não praticado</span>}
              </button>
              {revealed && <CopyLine text={segment.referenceText} />}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/** Puts a finished line on the clipboard — to paste into a translator. */
function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Some embedded browsers refuse the async API; the old route still works there.
      setCopied(copyWithSelection(text));
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      tabIndex={-1}
      aria-label={copied ? 'copiado' : 'copiar trecho'}
      title={copied ? 'Copiado' : 'Copiar'}
      className={`absolute top-2 right-2 flex size-8 items-center justify-center rounded-sm hover:bg-raised ${
        copied ? 'text-ok' : 'text-dim hover:text-fg'
      }`}
    >
      {copied ? (
        <Check size={16} weight="bold" aria-hidden="true" />
      ) : (
        <Copy size={16} aria-hidden="true" />
      )}
    </button>
  );
}

function copyWithSelection(text: string): boolean {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
