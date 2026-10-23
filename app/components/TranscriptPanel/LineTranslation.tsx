'use client';

/**
 * A finished line, in Portuguese, on request.
 *
 * Cheap on purpose: Google is only asked when the translate button is pressed
 * (hovering fired far too many requests), closing the card cancels a request
 * still in flight, and every line is translated at most once — kept in memory
 * and in localStorage, so a line read yesterday shows at once.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'eartype:translations';
/** A few videos' worth; oldest entries go first. */
const STORAGE_LIMIT = 2000;
const GAP = 8;
const EDGE = 16;

export type LineTranslationState =
  | { status: 'idle' }
  | { status: 'loading' | 'ok' | 'error'; index: number; anchor: DOMRect; translation?: string };

// --------------------------------------------------------------- the cache

let memory: Map<string, string> | null = null;

function cache(): Map<string, string> {
  if (memory !== null) return memory;
  memory = new Map();
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? '{}') as unknown;
    if (stored !== null && typeof stored === 'object') {
      for (const [text, translation] of Object.entries(stored)) {
        if (typeof translation === 'string') memory.set(text, translation);
      }
    }
  } catch {
    // Private window or blocked storage: the in-memory cache still works.
  }
  return memory;
}

function remember(text: string, translation: string): void {
  const entries = cache();
  entries.set(text, translation);
  while (entries.size > STORAGE_LIMIT) {
    entries.delete(entries.keys().next().value as string);
  }
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Quota or blocked storage: losing the cache only costs a request.
  }
}

// ---------------------------------------------------------------- the hook

export function useLineTranslation() {
  const [state, setState] = useState<LineTranslationState>({ status: 'idle' });
  const request = useRef<AbortController | null>(null);

  const hide = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setState({ status: 'idle' });
  }, []);

  const show = useCallback(async (index: number, text: string, element: HTMLElement) => {
    request.current?.abort();
    request.current = null;

    const anchor = element.getBoundingClientRect();
    const cached = cache().get(text);
    if (cached !== undefined) {
      setState({ status: 'ok', index, anchor, translation: cached });
      return;
    }

    setState({ status: 'loading', index, anchor });
    const controller = new AbortController();
    request.current = controller;

    try {
      const response = await fetch(`/api/translate?text=${encodeURIComponent(text)}`, {
        signal: controller.signal,
      });
      const body = (await response.json()) as { translation?: string };
      if (!response.ok || typeof body.translation !== 'string') throw new Error();
      remember(text, body.translation);
      setState({ status: 'ok', index, anchor, translation: body.translation });
    } catch {
      if (controller.signal.aborted) return;
      setState({ status: 'error', index, anchor });
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, []);

  useEffect(() => () => request.current?.abort(), []);

  return { state, show, hide };
}

// ------------------------------------------------------------- the tooltip

/**
 * One fixed card for the whole panel. On wide screens the panel sits on the
 * right, so the card opens to the left of the line; when there is no room
 * there (the stacked mobile layout) it opens below, or above near the bottom.
 */
export function TranslationTooltip({ id, state }: { id: string; state: LineTranslationState }) {
  const card = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const anchor = state.status === 'idle' ? null : state.anchor;

  useLayoutEffect(() => {
    if (anchor === null || card.current === null) {
      setPosition(null);
      return;
    }

    const { width, height } = card.current.getBoundingClientRect();
    const clamp = (value: number, max: number) => Math.min(Math.max(value, EDGE), max - EDGE);
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (anchor.left - GAP - width >= EDGE) {
      setPosition({
        left: anchor.left - GAP - width,
        top: clamp(anchor.top, viewportHeight - height),
      });
      return;
    }

    const below = anchor.bottom + GAP;
    setPosition({
      left: clamp(anchor.left, viewportWidth - width),
      top: below + height <= viewportHeight - EDGE ? below : Math.max(EDGE, anchor.top - GAP - height),
    });
  }, [anchor, state.status]);

  if (state.status === 'idle') return null;

  return (
    <div
      ref={card}
      id={id}
      role="tooltip"
      style={position ?? { top: 0, left: 0, visibility: 'hidden' }}
      className="pointer-events-none fixed z-50 w-max max-w-[min(24rem,calc(100vw-2rem))] rounded-sm border border-line bg-raised px-4 py-3 shadow-lg"
    >
      {state.status === 'loading' && <p className="text-sm text-muted">traduzindo…</p>}
      {state.status === 'error' && <p className="text-sm text-warn">não foi possível traduzir agora</p>}
      {state.status === 'ok' && <p className="text-sm leading-snug text-fg">{state.translation}</p>}
      <p className="mt-2 text-[11px] tracking-[0.08em] text-dim uppercase">Google Tradutor</p>
    </div>
  );
}
