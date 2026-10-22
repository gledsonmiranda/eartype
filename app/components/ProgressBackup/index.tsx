'use client';

/**
 * R-10 — progress lives in this browser only, so clearing site data would take
 * every video with it. One file out, one file back in.
 */

import { useRef, useState } from 'react';
import { exportAll, importAll, PROGRESS_CHANGED } from '@/lib/practice/progress';

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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
      <button type="button" onClick={download} className="underline underline-offset-4 hover:text-fg">
        Exportar progresso
      </button>
      <button
        type="button"
        onClick={() => file.current?.click()}
        className="underline underline-offset-4 hover:text-fg"
      >
        Importar
      </button>
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
        <span role="status" className={message.ok ? 'text-ok' : 'text-warn'}>
          {message.text}
        </span>
      )}
    </div>
  );
}
