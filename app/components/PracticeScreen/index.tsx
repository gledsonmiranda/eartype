'use client';

/**
 * T-08 — the loop itself: play a segment, pause, type it, see the diff, next.
 *
 * Three zones (§8): player on top, input and feedback in the middle, progress
 * and shortcuts at the foot. The point of the screen is that your hands never
 * leave the keyboard — Enter checks and advances, Ctrl+Enter replays.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AccuracyBadge, DiffView } from '@/app/components/DiffView';
import { TranscriptPanel } from '@/app/components/TranscriptPanel';
import { VideoPlayer } from '@/app/components/VideoPlayer';
import { compare, isPerfect } from '@/lib/correction/diff';
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
import type { CaptionKind, CorrectionMode, DiffResult, Segment } from '@/types';

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
};

export function PracticeScreen({
  videoId,
  segments,
  captionKind,
  startIndex = 0,
  onLeave,
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

  const player = useRef<YouTubePlayer | null>(null);
  const playback = useRef<Playback | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const segment = segments[session.index];
  const canBeStrict = captionKind === 'manual';
  const mode: CorrectionMode = strict && canBeStrict ? 'strict' : 'lenient';

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

    // Space pauses/resumes — but only before typing starts, so it still
    // works as a normal word separator once there's an answer in progress.
    if (event.key === ' ' && typed === '') {
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

  return (
    <main className="mx-auto grid w-full max-w-[1400px] gap-4 p-4 lg:h-screen lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-4">
        <section>
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
          <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
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
          <section className="flex flex-col gap-3 rounded-lg border border-zinc-700 p-6">
            <h2 className="text-lg font-semibold">Fim do vídeo</h2>
            <p className="text-sm text-zinc-300">
              {counts.correct} de {session.total} de primeira · {counts.accepted} aceitos com erro ·{' '}
              {counts.skipped} revelados
            </p>
            <div>
              <button
                type="button"
                onClick={onLeave}
                className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900"
              >
                Praticar outro vídeo
              </button>
            </div>
          </section>
        ) : (
          <section className="flex flex-col gap-3">
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
              className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-900 p-3 font-mono text-lg text-zinc-100 outline-none focus:border-zinc-400"
            />

            {result !== null && (
              <div
                className={`flex flex-col gap-2 rounded-md border p-3 ${
                  isPerfect(result)
                    ? 'border-emerald-500/50 bg-emerald-500/10'
                    : 'border-zinc-700 bg-zinc-900/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs tracking-wide uppercase ${
                      isPerfect(result) ? 'font-semibold text-emerald-300' : 'text-zinc-400'
                    }`}
                  >
                    {isPerfect(result) ? '✓ acertou' : 'correção'}
                  </span>
                  <AccuracyBadge accuracy={result.accuracy} />
                </div>
                <DiffView result={result} />
                {!isPerfect(result) && (
                  <p className="font-mono text-sm text-zinc-400">{segment?.referenceText}</p>
                )}
              </div>
            )}

            {revealed && segment !== undefined && (
              <p className="rounded-md border border-zinc-700 bg-zinc-900/60 p-3 font-mono text-lg text-zinc-200">
                {segment.referenceText}
              </p>
            )}

            <div className="flex flex-wrap gap-2 text-sm">
              <Action onClick={play}>repetir · Ctrl+Enter</Action>
              {result !== null && !isPerfect(result) && (
                <>
                  <Action onClick={retry}>tentar de novo</Action>
                  <Action onClick={acceptAndMoveOn}>aceitar e seguir · Enter</Action>
                </>
              )}
              {result === null && !revealed && <Action onClick={reveal}>revelar · Ctrl+→</Action>}
              {revealed && <Action onClick={acceptAndMoveOn}>próximo · Enter</Action>}
            </div>
          </section>
        )}

        <footer className="flex items-center justify-between border-t border-zinc-800 pt-3 text-xs text-zinc-400">
          <span>
            trecho {Math.min(session.index + 1, session.total)} de {session.total}
            {session.attempts > 0 && ` · ${session.attempts} tentativa(s)`}
          </span>
          <span className="hidden sm:inline">
            Enter verifica · Ctrl+Enter repete · Espaço pausa/retoma · Ctrl+→ revela · Alt+←/→
            navega
          </span>
          <span className="flex items-center gap-2">
            {captionKind === 'manual' ? 'legenda manual' : 'legenda auto-gerada'}
            {canBeStrict && (
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={strict}
                  onChange={(event) => setStrict(event.target.checked)}
                  className="accent-zinc-300"
                />
                modo estrito
              </label>
            )}
          </span>
        </footer>
      </div>

      <TranscriptPanel
        segments={segments}
        outcomes={session.outcomes}
        currentIndex={session.index}
        showAll={showAll}
        onToggleShowAll={() => setShowAll((current) => !current)}
        onSelect={(index) => moveWith((current) => goToSegment(current, index))}
      />
    </main>
  );
}

function Action({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-zinc-600 px-3 py-1 text-zinc-200 hover:border-zinc-400"
    >
      {children}
    </button>
  );
}
