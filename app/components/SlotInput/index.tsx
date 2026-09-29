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
  ref?: React.Ref<HTMLTextAreaElement>;
};

const DONE: Record<TokenStatus, string> = {
  correct: 'text-emerald-300',
  typo: 'text-amber-300 underline decoration-dotted decoration-2 underline-offset-8',
  wrong: 'text-red-300 line-through decoration-2',
  missing: 'text-zinc-400',
  extra: 'text-zinc-500 line-through decoration-2',
};

const SLOT: Record<Slot['kind'], string> = {
  typed: '',
  empty: 'text-zinc-600',
  fixed: 'text-zinc-500',
  overflow: 'text-red-300/80',
};

/** A zero-width flex item, stretched to the line so the bar spans the glyphs. */
function Caret() {
  return (
    <span className="relative w-0 self-stretch">
      <span className="absolute inset-y-1 -left-px w-0.5 animate-pulse bg-zinc-100" />
    </span>
  );
}

function Word({ word, focused }: { word: WordSlots; focused: boolean }) {
  const tone =
    word.state === 'done' && word.status !== undefined
      ? DONE[word.status]
      : word.state === 'current'
        ? 'text-zinc-100'
        : 'text-zinc-300';

  // The caret sits on the first blank, or after the last letter when full.
  const firstEmpty = word.slots.findIndex((slot) => slot.kind === 'empty');
  const caretAt = word.state === 'current' && focused ? (firstEmpty === -1 ? word.slots.length : firstEmpty) : -1;

  return (
    <span className={`inline-flex whitespace-pre ${tone}`}>
      {word.slots.map((slot, index) => (
        <Fragment key={index}>
          {index === caretAt && <Caret />}
          <span className={word.state === 'done' ? '' : SLOT[slot.kind]}>{slot.char}</span>
        </Fragment>
      ))}
      {caretAt === word.slots.length && <Caret />}
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
      <p
        aria-hidden
        className={`flex min-h-[4.5rem] flex-wrap content-start gap-x-4 gap-y-2 py-2 font-mono text-2xl leading-relaxed tracking-[0.2em] transition-opacity ${
          focused ? '' : 'opacity-60'
        }`}
      >
        {words.map((word, index) => (
          <Word key={index} word={word} focused={focused} />
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
