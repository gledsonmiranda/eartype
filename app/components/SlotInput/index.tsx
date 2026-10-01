'use client';

/**
 * POC — the borderless "word slots" input (docs/todo.md).
 *
 * What you see is drawn: one blank per letter of each reference word, filled
 * as you type. What you type into is still a real textarea, stacked on top
 * and fully transparent — so keyboard shortcuts, IME, paste and screen readers
 * behave exactly as they did with the plain field.
 *
 * Colour is never the only signal (§8): a finished word also carries the same
 * shapes the diff uses — dotted underline for a typo, strike for a wrong one.
 */

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { slotWords, type Slot, type WordSlots } from '@/lib/practice/slots';
import type { CorrectionMode, TokenStatus } from '@/types';

export type SlotInputProps = {
  reference: string;
  value: string;
  mode: CorrectionMode;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  ariaLabel: string;
  /** Hovering the current word offers to give it away (see `revealNextWord`). */
  onRevealWord?: () => void;
  ref?: React.Ref<HTMLTextAreaElement>;
};

const DONE: Record<TokenStatus, string> = {
  correct: 'text-ok',
  typo: 'text-warn underline decoration-dotted decoration-2 underline-offset-8',
  wrong: 'text-bad line-through decoration-2',
  missing: 'text-muted',
  extra: 'text-dim line-through decoration-2',
};

const SLOT: Record<Slot['kind'], string> = {
  typed: '',
  empty: 'text-line-strong',
  fixed: 'text-dim',
  overflow: 'text-bad/80',
};

/** A zero-width flex item, stretched to the line so the bar spans the glyphs. */
function Caret() {
  return (
    <span className="relative w-0 self-stretch">
      <span className="absolute inset-y-1 -left-px w-0.5 animate-pulse bg-accent" />
    </span>
  );
}

function Word({
  word,
  focused,
  onReveal,
}: {
  word: WordSlots;
  focused: boolean;
  onReveal?: () => void;
}) {
  const tone =
    word.state === 'done' && word.status !== undefined
      ? DONE[word.status]
      : word.state === 'current'
        ? 'text-fg'
        : 'text-fg/80';

  // The caret sits on the first blank, or after the last letter when full.
  const firstEmpty = word.slots.findIndex((slot) => slot.kind === 'empty');
  const caretAt = word.state === 'current' && focused ? (firstEmpty === -1 ? word.slots.length : firstEmpty) : -1;

  const revealable = onReveal !== undefined && word.state === 'current' && word.reference !== null;

  return (
    <span className={`group relative inline-flex whitespace-pre ${tone}`}>
      {word.slots.map((slot, index) => (
        <Fragment key={index}>
          {index === caretAt && <Caret />}
          <span className={word.state === 'done' ? '' : SLOT[slot.kind]}>{slot.char}</span>
        </Fragment>
      ))}
      {caretAt === word.slots.length && <Caret />}
      {revealable && (
        // Padding, not margin, below the button: the gap stays part of the
        // hover area, so moving the mouse up to it does not make it vanish.
        <span className="invisible absolute bottom-full left-1/2 -translate-x-1/2 pb-1 group-hover:visible">
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onReveal}
            className="flex items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-2 py-1 font-sans text-xs tracking-normal whitespace-nowrap text-fg shadow-sm hover:border-accent"
          >
            ver palavra
            <span className="font-mono text-muted">Ctrl ↓</span>
          </button>
        </span>
      )}
    </span>
  );
}

export function SlotInput({
  reference,
  value,
  mode,
  onChange,
  onKeyDown,
  ariaLabel,
  onRevealWord,
  ref,
}: SlotInputProps) {
  const [focused, setFocused] = useState(false);
  const field = useRef<HTMLTextAreaElement | null>(null);
  // `autoFocus` can land before `onFocus` is listening — ask the document.
  useEffect(() => {
    setFocused(document.activeElement === field.current);
  }, []);
  const words = useMemo(() => slotWords(reference, value, mode), [reference, value, mode]);

  return (
    <div className="relative">
      {/* Above the textarea so the words can be hovered; a press anywhere on
          them still lands the focus in the field underneath. */}
      <p
        aria-hidden
        onMouseDown={(event) => {
          event.preventDefault();
          field.current?.focus();
        }}
        className={`relative z-10 flex min-h-[4.5rem] cursor-text flex-wrap content-start gap-x-4 gap-y-2 py-2 font-mono text-2xl leading-relaxed tracking-[0.2em] transition-opacity ${
          focused ? '' : 'opacity-60'
        }`}
      >
        {words.map((word, index) => (
          <Word key={index} word={word} focused={focused} onReveal={onRevealWord} />
        ))}
      </p>

      <textarea
        ref={(node) => {
          field.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        aria-label={ariaLabel}
        className="absolute inset-0 h-full w-full cursor-text resize-none bg-transparent text-transparent caret-transparent opacity-0 outline-none"
      />
    </div>
  );
}
