'use client';

/**
 * R-10 — progress lives in this browser only, so clearing site data would take
 * every video with it. One file out, one file back in.
 */

import { useRef, useState } from 'react';
import { exportAll, importAll, PROGRESS_CHANGED } from '@/lib/practice/progress';

const BUTTON =
  'flex h-10 items-center gap-2 rounded-sm border border-line bg-surface px-4 text-sm font-medium text-fg hover:border-accent hover:text-accent';

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
      setMessage({
        ok: true,
        text:
          result.count === 0
            ? 'nada novo — o que já está aqui é mais recente'
            : `${result.count} ${result.count === 1 ? 'vídeo importado' : 'vídeos importados'}`,
      });
    } else {
      setMessage({ ok: false, text: result.message });
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={download} className={BUTTON}>
          {/* tray with an arrow out */}
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
          </svg>
          Exportar progresso
        </button>
        <button type="button" onClick={() => file.current?.click()} className={BUTTON}>
          {/* tray with an arrow in */}
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12M7 10l5 5 5-5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
          </svg>
          Importar progresso
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
