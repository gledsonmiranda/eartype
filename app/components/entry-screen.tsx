'use client';

/**
 * T-09 — the way in: a URL, and the paste path next to it.
 *
 * RF-02b is not an error screen. Pasting an SRT/VTT by hand is the only route
 * that does not depend on an undocumented endpoint staying up, so it sits on
 * this screen from the start, and every failure points at it.
 */

import { useState } from 'react';
import { CaptionParseError, parseCaptions } from '@/lib/captions/parse-captions';
import { segment as segmentCues } from '@/lib/captions/segmenter';
import { parseYouTubeUrl } from '@/lib/youtube/parse-url';
import type { CaptionKind, Cue, Segment } from '@/types';

export type StartRequest = {
  videoId: string;
  segments: Segment[];
  captionKind: CaptionKind;
  startIndex: number;
};

export type EntryScreenProps = {
  onStart: (request: StartRequest) => void;
};

type TranscriptResponse = { cues: Cue[]; kind: CaptionKind };
type ErrorResponse = { error?: { code?: string; message?: string } };

/** Where to drop the user in, given a `t=` in the URL they pasted. */
function indexForTime(segments: Segment[], startSec: number | undefined): number {
  if (startSec === undefined) return 0;
  const startMs = startSec * 1000;
  const index = segments.findIndex((current) => current.endMs > startMs);
  return index === -1 ? 0 : index;
}

function describe(cues: Cue[]): string {
  const lastMs = cues[cues.length - 1]?.endMs ?? 0;
  const minutes = Math.floor(lastMs / 60_000);
  const seconds = Math.round((lastMs % 60_000) / 1000);
  return `${cues.length} cues · cobre ${minutes}min${String(seconds).padStart(2, '0')}`;
}

export function EntryScreen({ onStart }: EntryScreenProps) {
  const [url, setUrl] = useState('');
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const video = parseYouTubeUrl(url);

  const start = (cues: Cue[], captionKind: CaptionKind) => {
    if (video === null) return;
    const segments = segmentCues(cues);

    if (segments.length === 0) {
      setError('a legenda até veio, mas não sobrou nenhum trecho praticável nela');
      return;
    }

    onStart({
      videoId: video.videoId,
      segments,
      captionKind,
      startIndex: indexForTime(segments, video.startSec),
    });
  };

  const fetchCaptions = async () => {
    if (video === null) {
      setError('não reconheci esse endereço do YouTube');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/transcript?videoId=${encodeURIComponent(video.videoId)}`);

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ErrorResponse;
        setError(body.error?.message ?? 'a busca automática falhou');
        setPasting(true); // Every failure hands over to the paste path.
        return;
      }

      const body = (await response.json()) as TranscriptResponse;
      start(body.cues, body.kind);
    } catch {
      setError('não consegui falar com o servidor');
      setPasting(true);
    } finally {
      setLoading(false);
    }
  };

  const usePasted = () => {
    if (video === null) {
      setError('cole também o endereço do vídeo — é ele que toca');
      return;
    }

    try {
      const { cues } = parseCaptions(pasted);
      // Pasted captions count as manual: they have punctuation (RF-02b).
      start(cues, 'manual');
    } catch (failure) {
      setError(
        failure instanceof CaptionParseError
          ? failure.message
          : 'não consegui ler essa legenda — confira se colou o arquivo inteiro',
      );
    }
  };

  let preview: string | null = null;
  if (pasting && pasted.trim() !== '') {
    try {
      preview = describe(parseCaptions(pasted).cues);
    } catch {
      preview = null;
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Eartype</h1>
        <p className="text-sm text-zinc-400">
          Cole a URL de um vídeo do YouTube. O vídeo toca em trechos curtos, pausa, e você digita o
          que ouviu.
        </p>
      </header>

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void fetchCaptions();
        }}
      >
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-zinc-300">endereço do vídeo</span>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            autoFocus
            spellCheck={false}
            placeholder="https://www.youtube.com/watch?v=..."
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm outline-none focus:border-zinc-400"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || url.trim() === ''}
            className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-40"
          >
            {loading ? 'buscando legenda…' : 'buscar legenda e começar'}
          </button>
          <button
            type="button"
            onClick={() => setPasting((current) => !current)}
            className="text-sm text-zinc-300 underline underline-offset-4"
          >
            {pasting ? 'esconder' : 'colar legenda à mão'}
          </button>
        </div>
      </form>

      {error !== null && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          {error}
        </p>
      )}

      {pasting && (
        <section className="flex flex-col gap-3 border-t border-zinc-800 pt-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium text-zinc-200">legenda SRT ou VTT</h2>
            <p className="text-xs text-zinc-400">
              Funciona sem o yt-dlp e sem depender do YouTube. O formato é detectado sozinho.
            </p>
          </div>
          <textarea
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={'1\n00:00:01,000 --> 00:00:03,000\nSo if this were back in 2011,'}
            className="w-full resize-y rounded-md border border-zinc-700 bg-zinc-900 p-3 font-mono text-xs outline-none focus:border-zinc-400"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={usePasted}
              disabled={pasted.trim() === ''}
              className="rounded-full border border-zinc-500 px-4 py-2 text-sm text-zinc-100 disabled:opacity-40"
            >
              usar esta legenda
            </button>
            {preview !== null && <span className="text-xs text-zinc-400">{preview}</span>}
          </div>
        </section>
      )}
    </main>
  );
}
