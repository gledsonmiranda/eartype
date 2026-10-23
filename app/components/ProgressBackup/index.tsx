'use client';

/**
 * R-10 — progress lives in this browser only, so clearing site data would take
 * every video with it. One file out, one file back in.
 */

import { useRef, useState } from 'react';
import { DownloadSimple, UploadSimple } from '@phosphor-icons/react';
import { exportAll, importAll, PROGRESS_CHANGED } from '@/lib/practice/progress';

const BUTTON =
  'flex h-10 min-w-10 items-center justify-center gap-2 rounded-sm border border-line bg-surface px-3 text-sm sm:px-4 font-medium text-fg hover:border-accent hover:text-accent';

export function ProgressBackup() {
  const file = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const download = () => {
    const blob = new Blob([exportAll()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `eartype-progresso-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage(null);
  };

  const upload = async (chosen: File) => {
    const result = importAll(await chosen.text());
    if (result.ok) {
      window.dispatchEvent(new Event(PROGRESS_CHANGED));
      const videos =
        result.count === 0
          ? result.vocabulary
            ? 'nenhum vídeo novo'
            : 'nada novo — o que já está aqui é mais recente'
          : `${result.count} ${result.count === 1 ? 'vídeo importado' : 'vídeos importados'}`;
      setMessage({ ok: true, text: result.vocabulary ? `${videos}, vocabulário mesclado` : videos });
    } else {
      setMessage({ ok: false, text: result.message });
    }
  };

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex items-center gap-3">
        {/* On a phone the labels go and the row says what the icons are about. */}
        <span className="text-sm text-muted sm:hidden">Progresso:</span>
        <button type="button" onClick={download} aria-label="Exportar progresso" title="Exportar progresso" className={BUTTON}>
          <UploadSimple size={18} weight="bold" aria-hidden="true" />
          <span className="hidden sm:inline">Exportar progresso</span>
        </button>
        <button
          type="button"
          onClick={() => file.current?.click()}
          aria-label="Importar progresso"
          title="Importar progresso"
          className={BUTTON}
        >
          <DownloadSimple size={18} weight="bold" aria-hidden="true" />
          <span className="hidden sm:inline">Importar progresso</span>
        </button>
      </div>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          event.target.value = '';
          if (chosen !== undefined) void upload(chosen);
        }}
      />
      {message !== null && (
        <span role="status" className={`text-sm ${message.ok ? 'text-ok' : 'text-warn'}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}
