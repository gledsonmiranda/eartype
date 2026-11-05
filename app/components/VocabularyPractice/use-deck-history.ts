'use client';

/**
 * Makes a running deck a step in the browser's history, on the same URL, so
 * Back returns to the categories instead of leaving the page.
 *
 * The entry only means something while its deck runs. Landing on it with no
 * deck — a reload, Back from another page, Forward — steps straight off it, so
 * no Back press is ever spent on a screen that looks the same.
 */

import { useCallback, useEffect, useRef } from 'react';

const DECK_ENTRY = 'eartypeDeck';

function onDeckEntry(): boolean {
  return window.history.state?.[DECK_ENTRY] === true;
}

function stepOffDeckEntry(): void {
  if (onDeckEntry()) window.history.back();
}

/** `onBack` must be stable: it closes the deck when the browser leaves its entry. */
export function useDeckHistory(onBack: () => void) {
  // Effects run twice in dev; two steps back would leave the page.
  const checkedOnMount = useRef(false);

  useEffect(() => {
    if (!checkedOnMount.current) {
      checkedOnMount.current = true;
      stepOffDeckEntry();
    }

    const onPopState = () => {
      onBack();
      stepOffDeckEntry();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [onBack]);

  const enterDeck = useCallback(() => window.history.pushState({ [DECK_ENTRY]: true }, ''), []);

  return { enterDeck, leaveDeck: stepOffDeckEntry };
}
