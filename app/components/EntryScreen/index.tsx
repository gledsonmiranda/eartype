'use client';

/**
 * T-09 — the way in, in the order that works: the library first (captions
 * already on disk), then a new video with its caption file, and only then the
 * automatic fetch — YouTube blocks it more often than not, so it is a
 * secondary button, not the main path.
 *
 * RF-02b is not an error screen: a caption file is the only route that does
 * not depend on an undocumented endpoint staying up. Pasting the text is kept
 * as a fallback for when there is no file to drop.
 */

import { useState, type ReactNode } from 'react';
import { CaptionDrop } from '@/app/components/CaptionDrop';
import { CaptionParseError, parseCaptions } from '@/lib/captions/parse-captions';
import { segment as segmentCues } from '@/lib/captions/segmenter';
import { parseYouTubeUrl } from '@/lib/youtube/parse-url';
import { SUBTITLE_SITES } from '@/lib/youtube/subtitle-sites';
import type { CaptionKind, Cue, Segment } from '@/types';

export type StartRequest = {
  videoId: string;
  segments: Segment[];
  captionKind: CaptionKind;
  startIndex: number;
  /** The cues the segments were built from — what "add to library" saves. */
  cues: Cue[];
};

export type EntryScreenProps = {
  /** The library grid, rendered on the server. */
  library: ReactNode;
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

type Parsed = { cues: Cue[] } | { error: string } | null;

function parse(raw: string): Parsed {
  if (raw.trim() === '') return null;
  try {
    return { cues: parseCaptions(raw).cues };
  } catch (failure) {
    return {
      error:
        failure instanceof CaptionParseError
          ? failure.message
          : 'não consegui ler essa legenda — confira se o arquivo está inteiro',
    };
  }
}

export function EntryScreen({ library, onStart }: EntryScreenProps) {
  const [url, setUrl] = useState('');
  // The caption text, from a dropped file or the paste box — one source.
  const [raw, setRaw] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const video = parseYouTubeUrl(url);
  const parsed = parse(raw);
  const cues = parsed !== null && 'cues' in parsed ? parsed.cues : null;

  const start = (startCues: Cue[], captionKind: CaptionKind) => {
    if (video === null) return;
    const segments = segmentCues(startCues);

    if (segments.length === 0) {
      setError('a legenda até veio, mas não sobrou nenhum trecho praticável nela');
      return;
    }

    onStart({
      videoId: video.videoId,
      segments,
      captionKind,
      startIndex: indexForTime(segments, video.startSec),
      cues: startCues,
    });
  };

  const startWithCaptions = () => {
    if (video === null) {
      setError(
        url.trim() === ''
          ? 'cole o endereço do vídeo — é ele que toca'
          : 'não reconheci esse endereço do YouTube',
      );
      return;
    }
    if (parsed === null) {
      setError('escolha o arquivo da legenda (ou cole o texto dela)');
      return;
    }
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }

    setError(null);
    // A caption file counts as manual: it has punctuation (RF-02b).
    start(parsed.cues, 'manual');
  };

  const fetchCaptions = async () => {
    if (video === null) {
      setError('cole primeiro o endereço do vídeo');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/transcript?videoId=${encodeURIComponent(video.videoId)}`);

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ErrorResponse;
        setError(
          `${body.error?.message ?? 'a busca automática falhou'} — use o arquivo da legenda acima`,
        );
        return;
      }

      const body = (await response.json()) as TranscriptResponse;
      start(body.cues, body.kind);
    } catch {
      setError('não consegui falar com o servidor — use o arquivo da legenda acima');
    } finally {
      setLoading(false);
    }
  };

  const canStart = !loading && video !== null && cues !== null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-[72px] items-center gap-3 border-b border-line-soft px-6 sm:px-12">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden="true">
          <path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0" />
          <path d="M12 9a1.5 1.5 0 0 1 1.5 1.5" />
        </svg>
        <span className="font-display text-[22px] font-bold tracking-tight">eartype</span>
        <span className="ml-4 hidden text-sm text-muted sm:inline">
          O vídeo toca em trechos curtos, pausa, e você digita o que ouviu.
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-14 px-6 py-12 sm:px-12">
        <section className="flex flex-col gap-4" aria-labelledby="new-video-title">
          <h2
            id="new-video-title"
            className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase"
          >
            Vídeo novo
          </h2>

          <form
            className="flex flex-col gap-6 rounded-md border border-line bg-surface p-6 sm:p-8"
            onSubmit={(event) => {
              event.preventDefault();
              startWithCaptions();
            }}
          >
            <div className="grid gap-8 lg:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm">
                <span className="flex items-center gap-2 font-semibold">
                  <Step active>1</Step>
                  Endereço do vídeo
                </span>
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  spellCheck={false}
                  placeholder="Cole o link do YouTube"
                  className="h-12 rounded-sm border border-line bg-bg px-4 font-mono text-sm text-fg outline-none placeholder:text-dim focus:border-accent"
                />
                <span className="text-xs text-muted">
                  Na tela de prática, “adicionar à biblioteca” guarda o vídeo e a legenda para a
                  próxima vez.
                </span>
                {video !== null && (
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    Baixar a legenda em:
                    {SUBTITLE_SITES.map((site) => (
                      <a
                        key={site.name}
                        href={site.href(video.videoId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-accent underline underline-offset-4 hover:brightness-110"
                      >
                        {site.name} ↗
                      </a>
                    ))}
                  </span>
                )}
              </label>

              <div className="flex flex-col gap-2 text-sm">
                <span className="flex items-center gap-2 font-semibold">
                  <Step active={video !== null}>2</Step>
                  Legenda
                </span>
                <CaptionDrop
                  fileName={fileName}
                  summary={cues !== null ? describe(cues) : parsed !== null ? 'não consegui ler' : null}
                  onLoad={(text, name) => {
                    setRaw(text);
                    setFileName(name);
                    setPasting(false);
                    setError(null);
                  }}
                  onError={setError}
                />
                {parsed !== null && 'error' in parsed && (
                  <span className="text-xs text-warn">{parsed.error}</span>
                )}
                <button
                  type="button"
                  onClick={() => setPasting((current) => !current)}
                  className="self-start text-xs text-muted underline underline-offset-4 hover:text-fg"
                >
                  {pasting ? 'esconder' : 'sem arquivo? cole o texto da legenda'}
                </button>
                {pasting && (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={raw}
                      onChange={(event) => {
                        setRaw(event.target.value);
                        setFileName(null);
                      }}
                      rows={8}
                      spellCheck={false}
                      placeholder={'1\n00:00:01,000 --> 00:00:03,000\nSo if this were back in 2011,'}
                      className="w-full resize-y rounded-sm border border-line bg-bg p-3 font-mono text-xs text-fg outline-none placeholder:text-dim focus:border-accent"
                    />
                    {cues !== null && fileName === null && (
                      <span className="text-xs text-muted">{describe(cues)}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line-soft pt-6">
              <button
                type="submit"
                disabled={!canStart}
                className="h-12 rounded-sm bg-accent px-8 text-base font-semibold text-bg hover:brightness-110 disabled:bg-line disabled:text-muted disabled:hover:brightness-100"
              >
                Começar
              </button>
              <button
                type="button"
                onClick={() => void fetchCaptions()}
                disabled={loading || video === null}
                title="usa o yt-dlp; o YouTube costuma bloquear"
                className="h-10 text-sm text-muted underline underline-offset-4 hover:text-fg disabled:opacity-40 disabled:no-underline"
              >
                {loading ? 'buscando legenda…' : 'Tentar buscar a legenda automaticamente'}
              </button>
            </div>

            {error !== null && (
              <p className="rounded-sm border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
                {error}
              </p>
            )}
          </form>
        </section>

        <section className="flex flex-col gap-6" aria-labelledby="library-title">
          <div className="flex flex-col gap-1">
            <h2
              id="library-title"
              className="font-display text-[32px] leading-tight font-bold tracking-tight"
            >
              Biblioteca
            </h2>
            <p className="text-sm text-muted">Vídeos com legenda já salva. Clique e pratique.</p>
          </div>
          {library}
        </section>
      </main>
    </div>
  );
}

function Step({ active, children }: { active?: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex size-[22px] items-center justify-center rounded-sm text-xs ${
        active ? 'bg-accent text-bg' : 'bg-line text-fg'
      }`}
    >
      {children}
    </span>
  );
}
