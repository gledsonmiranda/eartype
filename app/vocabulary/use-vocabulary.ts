'use client';

/**
 * The merged word list and the overlay behind it. Storage is only read after
 * mount, so the server render and the first client render agree (an empty
 * overlay); `ready` says when the real one is in.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import builtInWords from '@/content/vocabulary/words.json';
import { PROGRESS_CHANGED } from '@/lib/practice/progress';
import { EMPTY_OVERLAY, loadOverlay, mergeWords, saveOverlay, type BuiltInWord, type Overlay } from '@/lib/vocabulary/words';

export const BUILT_IN: readonly BuiltInWord[] = builtInWords;

export function useVocabulary() {
  const [overlay, setOverlay] = useState<Overlay>(EMPTY_OVERLAY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setOverlay(loadOverlay());
      setReady(true);
    };
    refresh();
    // Edits or practice in another tab, or a backup imported on this page.
    window.addEventListener('storage', refresh);
    window.addEventListener(PROGRESS_CHANGED, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(PROGRESS_CHANGED, refresh);
    };
  }, []);

  /** Applies a change and saves it — read fresh so two tabs don't undo each other. */
  const update = useCallback((change: (current: Overlay) => Overlay) => {
    const next = change(loadOverlay());
    saveOverlay(next);
    setOverlay(next);
  }, []);

  const words = useMemo(() => mergeWords(BUILT_IN, overlay), [overlay]);

  return { words, overlay, ready, update };
}
