'use client';

import { useState, useSyncExternalStore } from 'react';
import { loadCaptionBlur, saveCaptionBlur } from '@/lib/player/caption-blur';

function subscribeStorage(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

/**
 * The saved "hide burned-in subtitles" choice. The server renders it off; a
 * click here wins even when storage is blocked and the save goes nowhere.
 */
export function useCaptionBlur(): [boolean, () => void] {
  const saved = useSyncExternalStore(subscribeStorage, loadCaptionBlur, () => false);
  const [picked, setPicked] = useState<boolean | null>(null);
  const on = picked ?? saved;

  const toggle = () => {
    setPicked(!on);
    saveCaptionBlur(!on);
  };

  return [on, toggle];
}
