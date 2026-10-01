'use client';

/**
 * RF-02b as a file: drop an .srt/.vtt here, or click to pick one. Reading and
 * parsing stay with the caller — this only turns a drop or a pick into text.
 */

import { useRef, useState } from 'react';

/** Far above any real caption file (a 2h video is ~200KB); a guard against the wrong file. */
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = /\.(srt|vtt)$/i;

export type CaptionDropProps = {
  /** Name of the file already loaded, if any. */
  fileName: string | null;
  /** A short summary of what was read ("189 cues · cobre 12min03"), shown under the name. */
  summary: string | null;
  onLoad: (text: string, fileName: string) => void;
  onError: (message: string) => void;
};

export function CaptionDrop({ fileName, summary, onLoad, onError }: CaptionDropProps) {
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const read = async (file: File | undefined) => {
    if (file === undefined) return;
    if (!ACCEPTED.test(file.name)) {
      onError(`“${file.name}” não é .srt nem .vtt`);
      return;
    }
    if (file.size > MAX_BYTES) {
      onError(`“${file.name}” é grande demais para ser uma legenda`);
      return;
    }

    try {
      onLoad(await file.text(), file.name);
    } catch {
      onError(`não consegui ler “${file.name}”`);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="escolher arquivo de legenda .srt ou .vtt"
      onClick={() => picker.current?.click()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          picker.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void read(event.dataTransfer.files[0]);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border-[1.5px] border-dashed px-4 py-5 text-center text-sm outline-none transition-colors focus-visible:border-accent ${
        dragging
          ? 'border-accent bg-raised'
          : fileName !== null
            ? 'border-ok/50 bg-ok/5'
            : 'border-line-strong hover:border-muted'
      }`}
    >
      <input
        ref={picker}
        type="file"
        accept=".srt,.vtt"
        className="hidden"
        onChange={(event) => {
          void read(event.target.files?.[0]);
          event.target.value = ''; // Picking the same file again still fires.
        }}
      />
      {fileName === null ? (
        <>
          <span className="text-fg">Arraste o arquivo .srt ou .vtt aqui</span>
          <span className="text-xs text-muted">ou clique para escolher</span>
        </>
      ) : (
        <>
          <span className="font-mono text-fg">{fileName}</span>
          <span className="text-xs text-muted">
            {summary ?? 'legenda carregada'} · clique ou arraste outro para trocar
          </span>
        </>
      )}
    </div>
  );
}
