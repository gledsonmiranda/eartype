'use client';

import { Subtitles, SubtitlesSlash } from '@phosphor-icons/react';

export function CaptionBlurToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const label = on ? 'Mostrar legenda do vídeo' : 'Esconder legenda do vídeo';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={on}
      title={label}
      className={`flex h-11 w-11 items-center justify-center rounded-sm border transition-colors ${
        on
          ? 'border-accent/50 bg-accent/10 text-accent'
          : 'border-line bg-surface text-muted hover:border-line-strong hover:text-fg'
      }`}
    >
      {on ? <SubtitlesSlash size={18} aria-hidden="true" /> : <Subtitles size={18} aria-hidden="true" />}
    </button>
  );
}
