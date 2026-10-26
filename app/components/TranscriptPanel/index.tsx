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

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Minus, Plus, Translate } from '@phosphor-icons/react';
import { SEGMENT_SIZES, type SegmentSize } from '@/lib/captions/segmenter';
import { isRevealed, type SegmentOutcome } from '@/lib/practice/session';
import type { Segment } from '@/types';
import { TranslationTooltip, useLineTranslation } from './LineTranslation';

export type TranscriptPanelProps = {
  segments: Segment[];
  outcomes: readonly SegmentOutcome[];
  currentIndex: number;
  showAll: boolean;
  onToggleShowAll: () => void;
  onSelect: (index: number) => void;
  size: SegmentSize;
  onSizeChange: (size: SegmentSize) => void;
};

const SIZE_LABELS: Record<SegmentSize, string> = { short: 'Curta', medium: 'Média', long: 'Longa' };

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
  size,
  onSizeChange,
}: TranscriptPanelProps) {
  const current = useRef<HTMLLIElement>(null);
  const tooltipId = useId();
  const translation = useLineTranslation();
  const { hide } = translation;
  const translatedIndex = translation.state.status === 'idle' ? null : translation.state.index;

  useEffect(() => {
    current.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentIndex]);

  // Hiding the transcript again must take its translation with it.
  useEffect(() => hide(), [showAll, hide]);

  // The card closes like a popover: Escape, or a press anywhere else.
  useEffect(() => {
    if (translatedIndex === null) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && hide();
    const onPress = (event: PointerEvent) => {
      // The translate buttons toggle on their own click.
      if ((event.target as Element).closest('[data-translate]') === null) hide();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPress);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPress);
    };
  }, [translatedIndex, hide]);

  const toggleTranslation = (index: number, text: string, line: HTMLElement) => {
    if (translatedIndex === index) hide();
    else void translation.show(index, text, line);
  };

  return (
    <aside className="flex max-h-96 min-h-0 flex-col border-t border-line-soft bg-sidebar lg:max-h-none lg:border-t-0 lg:border-l">
      <header className="flex h-14 items-center justify-between gap-2 border-b border-line-soft px-5">
        <h2 className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">Legenda</h2>
        <div className="flex items-center gap-3">
          <SizeStepper size={size} onChange={onSizeChange} />
          <button
            type="button"
            onClick={onToggleShowAll}
            aria-pressed={showAll}
            className="h-9 rounded-sm border border-line px-3.5 text-[13px] whitespace-nowrap text-fg hover:border-line-strong"
          >
            {showAll ? 'Esconder' : 'Mostrar tudo'}
          </button>
        </div>
      </header>

      <ol className="min-h-0 flex-1 overflow-y-auto py-2" onScroll={translatedIndex === null ? undefined : hide}>
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
                aria-describedby={translatedIndex === index ? tooltipId : undefined}
                // Reading is opt-in; tabbing through 279 lines is not.
                tabIndex={-1}
                className={`flex w-full gap-3 border-l-[3px] py-3 pl-5 text-left text-sm ${revealed ? 'min-h-20 pr-12' : 'pr-5'} ${
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
                    revealed ? 'text-fg' : 'text-muted blur-[5px] select-none'
                  }`}
                  aria-hidden={!revealed}
                >
                  {segment.referenceText}
                </span>
                {!revealed && <span className="sr-only">trecho ainda não praticado</span>}
              </button>
              {revealed && (
                <div className="absolute top-2 right-2 flex flex-col">
                  <button
                    type="button"
                    data-translate
                    onClick={(event) =>
                      toggleTranslation(index, segment.referenceText, event.currentTarget.closest('li') ?? event.currentTarget)
                    }
                    tabIndex={-1}
                    aria-label="traduzir trecho"
                    aria-expanded={translatedIndex === index}
                    title="Traduzir"
                    className={`flex size-8 items-center justify-center rounded-sm hover:bg-raised ${
                      translatedIndex === index ? 'text-accent' : 'text-dim hover:text-fg'
                    }`}
                  >
                    <Translate size={16} aria-hidden="true" />
                  </button>
                  <CopyLine text={segment.referenceText} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <TranslationTooltip id={tooltipId} state={translation.state} />
    </aside>
  );
}

/**
 * − for shorter pieces, + for longer ones. At either end the button stays
 * where it is, dimmed and inert, so the label never shifts under the cursor.
 */
function SizeStepper({ size, onChange }: { size: SegmentSize; onChange: (size: SegmentSize) => void }) {
  const at = SEGMENT_SIZES.indexOf(size);
  const step = (by: number) => {
    const next = SEGMENT_SIZES[at + by];
    if (next !== undefined) onChange(next);
  };

  return (
    <div role="group" aria-label="tamanho do trecho" className="flex items-center">
      <StepButton label="trechos menores" title="Trechos menores" atEnd={at === 0} onClick={() => step(-1)}>
        <Minus size={13} aria-hidden="true" />
      </StepButton>
      <span aria-live="polite" className="min-w-10 text-center text-xs text-muted">
        {SIZE_LABELS[size]}
      </span>
      <StepButton
        label="trechos maiores"
        title="Trechos maiores"
        atEnd={at === SEGMENT_SIZES.length - 1}
        onClick={() => step(1)}
      >
        <Plus size={13} aria-hidden="true" />
      </StepButton>
    </div>
  );
}

function StepButton({
  label,
  title,
  atEnd,
  onClick,
  children,
}: {
  label: string;
  title: string;
  atEnd: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-disabled={atEnd}
      title={title}
      className={`flex size-6 items-center justify-center rounded-sm text-dim ${
        atEnd ? 'cursor-default opacity-35' : 'hover:bg-raised hover:text-fg'
      }`}
    >
      {children}
    </button>
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
      className={`flex size-8 items-center justify-center rounded-sm hover:bg-raised ${
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
