'use client';

/**
 * T-08 — the loop itself: play a segment, pause, type it, see the diff, next.
 *
 * Three zones (§8): player on top, input and feedback in the middle, progress
 * and shortcuts at the foot. The point of the screen is that your hands never
 * leave the keyboard — Enter checks and advances, Ctrl+Enter replays.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AddToLibrary } from '@/app/components/AddToLibrary';
import { AccuracyBadge, DiffView } from '@/app/components/DiffView';
import { SlotInput } from '@/app/components/SlotInput';
import { TranscriptPanel } from '@/app/components/TranscriptPanel';
import { VideoPlayer } from '@/app/components/VideoPlayer';
import { compare, isPerfect, liveCompare } from '@/lib/correction/diff';
import { playSegment, type Playback } from '@/lib/player/segment-playback';
import {
  PLAYER_ERROR_MESSAGES,
  type PlayerErrorCode,
  type YouTubePlayer,
} from '@/lib/player/youtube-iframe';
import {
  countAttempt,
  firstPending,
  goTo as goToSegment,
  isFinished,
  previous as previousSegment,
  recordOutcome,
  startSession,
  tally,
  type Session,
} from '@/lib/practice/session';
import type { CaptionKind, CorrectionMode, Cue, DiffResult, Segment } from '@/types';

/**
 * §RF-05 — a clean answer moves on by itself. 700ms turned out to be too fast
 * to register the hit: the screen changed before you could enjoy it. Long
 * enough to read "✓ acertou", short enough to keep the rhythm.
 */
const AUTO_ADVANCE_MS = 1200;

export type PracticeScreenProps = {
  videoId: string;
  segments: Segment[];
  captionKind: CaptionKind;
  startIndex?: number;
  onLeave: () => void;
  /**
   * The captions this session came from, when it did not come from the
   * library — what "add to library" saves. Absent: no button.
   */
  libraryCues?: Cue[];
  /** Shown in the header when known (library videos). */
  title?: string;
};

export function PracticeScreen({
  videoId,
  segments,
  captionKind,
  startIndex = 0,
  onLeave,
  libraryCues,
  title,
}: PracticeScreenProps) {
  const [session, setSession] = useState<Session>(() => startSession(segments.length, startIndex));
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<DiffResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [playerError, setPlayerError] = useState<PlayerErrorCode | null>(null);
  const [ready, setReady] = useState(false);
  // §2 — lenient by default, always. Strict is an option, and only an option
  // where there is punctuation to be strict about (RF-02).
  const [strict, setStrict] = useState(false);
  // The transcript panel is blurred until each line is earned; this lifts it.
  const [showAll, setShowAll] = useState(false);
  // POC — the blanks-per-letter hint. On by default while it is being tried;
  // off brings back the plain field and the live diff underneath it.
  const [slots, setSlots] = useState(true);

  const player = useRef<YouTubePlayer | null>(null);
  const playback = useRef<Playback | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const segment = segments[session.index];
  const canBeStrict = captionKind === 'manual';
  const mode: CorrectionMode = strict && canBeStrict ? 'strict' : 'lenient';

  // POC — live per-word feedback as you type. Sentence-level scoring is
  // untouched: it still only runs in `check()`, on Enter.
  const liveTokens = useMemo(() => {
    if (result !== null || segment === undefined) return [];
    return liveCompare(segment.referenceText, typed, mode);
  }, [result, segment, typed, mode]);

  const play = useCallback(() => {
    const current = player.current;
    if (current === null || segment === undefined) return;

    playback.current?.cancel();
    playback.current = playSegment(current, segment, {
      onEnd: () => input.current?.focus(),
    });
  }, [segment]);

  // Autoplay each new segment, and stop polling when the screen goes away.
  useEffect(() => {
    if (!ready) return;
    play();
    return () => playback.current?.cancel();
  }, [play, ready]);

  useEffect(() => {
    input.current?.focus();
  }, [session.index]);

  const moveWith = (move: (session: Session) => Session) => {
    playback.current?.cancel();
    setTyped('');
    setResult(null);
    setRevealed(false);
    setSession(move);
  };

  /**
   * The next segment, or — at the end of the video — the first one still
   * open. Starting from a `t=` in the URL leaves earlier segments pending,
   * and this is what brings them back instead of ending the run early.
   */
  const advance = () =>
    moveWith((current) => {
      const at = current.index + 1;
      if (at < current.total && current.outcomes[at] === 'pending') return goToSegment(current, at);

      const pending = firstPending(current);
      return pending === null ? goToSegment(current, at) : goToSegment(current, pending);
    });

  const check = () => {
    if (segment === undefined || typed.trim() === '') return;
    // Already right and waiting to advance: a second Enter must not fire again.
    if (result !== null && isPerfect(result)) return;

    const diff = compare(segment.referenceText, typed, mode);
    setResult(diff);

    if (isPerfect(diff)) {
      setSession((current) => recordOutcome(current, 'correct'));
      window.setTimeout(advance, AUTO_ADVANCE_MS);
      return;
    }

    setSession((current) => countAttempt(current));
  };

  const acceptAndMoveOn = () => {
    setSession((current) => recordOutcome(current, 'accepted'));
    advance();
  };

  const retry = () => {
    setResult(null);
    setTyped('');
    input.current?.focus();
    play();
  };

  const reveal = () => {
    setRevealed(true);
    setResult(null);
    setSession((current) => recordOutcome(current, 'skipped'));
  };

  const togglePause = () => {
    const current = player.current;
    if (current === null) return;
    // YT.PlayerState.PLAYING === 1 — the only state worth resuming *from*.
    if (current.getPlayerState() === 1) current.pauseVideo();
    else current.playVideo();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      play();
      return;
    }

    // Ctrl+Space pauses/resumes — plain Space stays a normal word separator,
    // needed from the first keystroke now that live per-word feedback reads
    // the input as you type.
    if (event.key === ' ' && event.ctrlKey) {
      event.preventDefault();
      togglePause();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      // A second Enter on a wrong answer is how you move on without the mouse.
      if (revealed || (result !== null && !isPerfect(result))) acceptAndMoveOn();
      else check();
      return;
    }

    // RF-10 spells this one out: Ctrl+→ skips the segment.
    if (event.ctrlKey && event.key === 'ArrowRight') {
      event.preventDefault();
      reveal();
      return;
    }

    if (event.altKey && event.key === 'ArrowRight') {
      event.preventDefault();
      advance();
      return;
    }

    if (event.altKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      moveWith(previousSegment);
    }
  };

  const counts = tally(session);
  const done = isFinished(session);
  const answered = session.total - counts.pending;
  const percent = session.total === 0 ? 0 : Math.round((answered / session.total) * 100);

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line-soft px-4 py-2 sm:px-8 lg:h-16 lg:py-0">
        <button
          type="button"
          onClick={onLeave}
          className="flex min-h-11 items-center gap-2 text-[15px] text-muted hover:text-fg"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Biblioteca
        </button>
        {title !== undefined && (
          <h1 className="min-w-0 truncate font-display text-[17px] font-bold">{title}</h1>
        )}
        <div className="flex min-w-48 flex-1 items-center gap-3">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={session.total}
            aria-valuenow={answered}
            aria-label="progresso do vídeo"
            className="h-1.5 flex-1 overflow-hidden rounded-sm bg-line"
          >
            <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
          <span className="font-mono text-[13px] whitespace-nowrap text-muted">
            {Math.min(session.index + 1, session.total)} / {session.total}
          </span>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm whitespace-nowrap">
          <input
            type="checkbox"
            checked={slots}
            onChange={(event) => {
              setSlots(event.target.checked);
              input.current?.focus();
            }}
            className="size-4 accent-accent"
          />
          Dica de letras
        </label>
        {canBeStrict && (
          <label className="flex min-h-11 items-center gap-2 text-sm whitespace-nowrap text-muted">
            <input
              type="checkbox"
              checked={strict}
              onChange={(event) => setStrict(event.target.checked)}
              className="size-4 accent-accent"
            />
            Modo estrito
          </label>
        )}
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <main className="flex min-h-0 flex-col gap-8 overflow-y-auto p-4 sm:p-8">
          <section className="mx-auto w-full max-w-[720px]">
            <VideoPlayer
              videoId={videoId}
              onReady={(created) => {
                player.current = created;
                setReady(true);
              }}
              onError={setPlayerError}
            />
          </section>

          {playerError !== null && (
            <p className="mx-auto w-full max-w-[720px] rounded-sm border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
              {PLAYER_ERROR_MESSAGES[playerError]} —{' '}
              <a
                className="underline"
                href={`https://www.youtube.com/watch?v=${videoId}`}
                target="_blank"
                rel="noreferrer"
              >
                abrir no YouTube
              </a>
            </p>
          )}

          {done ? (
            <section className="mx-auto flex w-full max-w-[720px] flex-col gap-4 rounded-md border border-line bg-surface p-8">
              <h2 className="font-display text-2xl font-bold">Fim do vídeo</h2>
              <p className="text-sm text-muted">
                {counts.correct} de {session.total} de primeira · {counts.accepted} aceitos com erro ·{' '}
                {counts.skipped} revelados
              </p>
              <div>
                <button
                  type="button"
                  onClick={onLeave}
                  className="h-11 rounded-sm bg-accent px-6 text-[15px] font-semibold text-bg"
                >
                  Praticar outro vídeo
                </button>
              </div>
            </section>
          ) : (
            <section className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">
                  {result !== null
                    ? isPerfect(result)
                      ? '✓ acertou'
                      : `Correção · trecho ${session.index + 1}`
                    : `Ouça e digite · trecho ${session.index + 1}`}
                </span>
                {result !== null ? (
                  <AccuracyBadge accuracy={result.accuracy} />
                ) : (
                  <Action onClick={play} keys="Ctrl ↵">
                    Repetir
                  </Action>
                )}
              </div>

              {result === null && (
                <div className="rounded-md border border-line bg-surface px-8 py-6">
                  {slots && segment !== undefined ? (
                    <SlotInput
                      ref={input}
                      reference={segment.referenceText}
                      value={typed}
                      mode={mode}
                      onChange={setTyped}
                      onKeyDown={onKeyDown}
                      ariaLabel={`digite o trecho ${session.index + 1} de ${session.total}`}
                    />
                  ) : (
                    <textarea
                      ref={input}
                      value={typed}
                      onChange={(event) => setTyped(event.target.value)}
                      onKeyDown={onKeyDown}
                      rows={2}
                      autoFocus
                      spellCheck={false}
                      autoCorrect="off"
                      autoCapitalize="off"
                      aria-label={`digite o trecho ${session.index + 1} de ${session.total}`}
                      placeholder="digite o que ouviu e aperte Enter"
                      className="w-full resize-none rounded-sm border border-line bg-bg p-3 font-mono text-xl text-fg outline-none focus:border-accent"
                    />
                  )}
                  {!slots && liveTokens.length > 0 && (
                    <div className="mt-3 border-t border-line-soft pt-3">
                      <DiffView tokens={liveTokens} showCorrections={false} ariaLabel="progresso, palavra por palavra" />
                    </div>
                  )}
                </div>
              )}

              {result !== null && (
                <div
                  className={`flex flex-col gap-5 rounded-md border p-8 ${
                    isPerfect(result) ? 'border-ok/50 bg-ok/10' : 'border-line bg-surface'
                  }`}
                >
                  <div className="flex flex-col gap-2">
                    <span className="text-xs tracking-[0.08em] text-muted uppercase">Você digitou</span>
                    <DiffView result={result} />
                  </div>
                  {!isPerfect(result) && (
                    <>
                      <div className="h-px bg-line" />
                      <div className="flex flex-col gap-2">
                        <span className="text-xs tracking-[0.08em] text-muted uppercase">Era</span>
                        <p className="font-mono text-xl leading-relaxed text-fg">{segment?.referenceText}</p>
                      </div>
                      <ul className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted">
                        <li className="flex items-center gap-2"><span className="w-3.5 border-t-[3px] border-ok" />certa</li>
                        <li className="flex items-center gap-2"><span className="w-3.5 border-t-[3px] border-dotted border-warn" />quase (digitação)</li>
                        <li className="flex items-center gap-2"><span className="w-3.5 border-t-[3px] border-bad" />errada</li>
                      </ul>
                    </>
                  )}
                </div>
              )}

              {revealed && segment !== undefined && (
                <p className="rounded-md border border-line bg-surface p-6 font-mono text-xl text-fg">
                  {segment.referenceText}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-muted">
                  {result === null && !revealed
                    ? 'Cada traço é uma letra. Pontuação é opcional.'
                    : session.attempts > 0
                      ? `${session.attempts} tentativa(s)`
                      : ''}
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  {result !== null && !isPerfect(result) && (
                    <>
                      <Action onClick={retry}>Tentar de novo</Action>
                      <Primary onClick={acceptAndMoveOn} keys="↵">
                        Aceitar e seguir
                      </Primary>
                    </>
                  )}
                  {result === null && !revealed && (
                    <>
                      <Action onClick={reveal} keys="Ctrl →" quiet>
                        Revelar
                      </Action>
                      <Primary onClick={check} keys="↵">
                        Verificar
                      </Primary>
                    </>
                  )}
                  {revealed && (
                    <Primary onClick={acceptAndMoveOn} keys="↵">
                      Próximo
                    </Primary>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
                <span>{captionKind === 'manual' ? 'legenda manual' : 'legenda auto-gerada'}</span>
                {libraryCues !== undefined && (
                  <AddToLibrary videoId={videoId} captionKind={captionKind} cues={libraryCues} />
                )}
              </div>
            </section>
          )}
        </main>

        <TranscriptPanel
          segments={segments}
          outcomes={session.outcomes}
          currentIndex={session.index}
          showAll={showAll}
          onToggleShowAll={() => setShowAll((current) => !current)}
          onSelect={(index) => moveWith((current) => goToSegment(current, index))}
        />
      </div>

      <footer className="hidden items-center justify-center gap-7 border-t border-line-soft py-4 text-[13px] text-muted sm:flex">
        <Key keys="↵">verifica</Key>
        <Key keys="Ctrl ↵">repete</Key>
        <Key keys="Ctrl Espaço">pausa</Key>
        <Key keys="Ctrl →">revela</Key>
        <Key keys="Alt ← →">navega</Key>
      </footer>
    </div>
  );
}

function Key({ keys, children }: { keys: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <kbd className="rounded-[3px] border border-line-strong px-2 py-0.5 font-mono text-xs text-fg">
        {keys}
      </kbd>
      {children}
    </span>
  );
}

function Action({
  onClick,
  children,
  keys,
  quiet = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  keys?: string;
  quiet?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 items-center gap-2 rounded-sm px-4 text-sm ${
        quiet
          ? 'text-muted hover:text-fg'
          : 'border border-line bg-surface text-fg hover:border-line-strong'
      }`}
    >
      {children}
      {keys !== undefined && <span className="font-mono text-xs text-muted">{keys}</span>}
    </button>
  );
}

function Primary({
  onClick,
  children,
  keys,
}: {
  onClick: () => void;
  children: React.ReactNode;
  keys: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 items-center gap-2 rounded-sm bg-accent px-6 text-[15px] font-semibold text-bg hover:brightness-110"
    >
      {children}
      <span className="font-mono text-xs opacity-70">{keys}</span>
    </button>
  );
}
