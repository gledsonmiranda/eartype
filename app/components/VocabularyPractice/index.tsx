'use client';

/**
 * Vocabulary practice: the home suggests today's session (or pick a subject),
 * then a deck of cards, a Portuguese word on each front — type the English,
 * Enter to check and the card flips to the answer, Enter (or a tap on it) for
 * the next one. Everything sits on the card, so on a phone it all fits above
 * the keyboard. In voice
 * mode the field is the microphone's alone: what it heard lands there, you
 * speak again if it misheard, and you are the one who confirms. Every answer
 * is saved to the word's stats as you go, so stopping loses nothing.
 *
 * Past-tense verbs are the one deck asked in English: the present on the front,
 * the past typed back. Always typed — a recognizer hears the past of `read` as
 * `red` and of `know` as `new`, which would mark right answers wrong.
 */

import { useCallback, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Keyboard, Microphone, X } from '@phosphor-icons/react';
import { useVocabulary } from '@/app/vocabulary/use-vocabulary';
import { checkAnswer, type Verdict } from '@/lib/vocabulary/check';
import {
  dailyMix,
  dailyQueue,
  DEFAULT_SESSION_SIZE,
  FIRST_SESSION_SIZE,
  hasPracticed,
  loadSessionSize,
  mixSize,
  progressOf,
  saveSessionSize,
  SESSION_SIZES,
  topicDeck,
  type SessionSize,
  type WordProgress,
} from '@/lib/vocabulary/daily';
import { DEFAULT_MODE, loadMode, saveMode, type AnswerMode } from '@/lib/vocabulary/mode';
import {
  ALL_CATEGORIES,
  answerWord,
  currentWord,
  dealVocabSession,
  deckOf,
  isAnswered,
  isFinished,
  nextWord,
  startVocabSession,
  stopSession,
  summarize,
  wordsIn,
  type VocabSession,
} from '@/lib/vocabulary/session';
import {
  categoriesOf,
  isoDate,
  isPastTense,
  PAST_TENSE_CATEGORY,
  promptOf,
  recordAnswer,
  type Word,
} from '@/lib/vocabulary/words';
import { useDeckHistory } from './use-deck-history';
import { useSpeech, type SpeechError } from './use-speech';

const PRIMARY =
  'flex h-12 items-center justify-center gap-2 rounded-sm bg-accent px-8 text-base font-semibold text-bg hover:brightness-110 disabled:bg-line disabled:text-muted disabled:hover:brightness-100';
const SECONDARY =
  'flex h-11 items-center justify-center gap-2 rounded-sm border border-line bg-surface px-5 text-sm font-medium text-fg hover:border-accent hover:text-accent';

const VERDICT_STYLE: Record<Verdict, { label: string; text: string; border: string }> = {
  right: { label: 'Certo', text: 'text-ok', border: 'border-ok' },
  almost: { label: 'Quase', text: 'text-warn', border: 'border-warn' },
  wrong: { label: 'Errado', text: 'text-bad', border: 'border-bad' },
};

/** Another tab switching the mode. */
function subscribeStorage(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

const SPEECH_ERRORS: Record<SpeechError, string> = {
  'not-allowed': 'o navegador não deixou usar o microfone — libere o acesso e tente de novo',
  'no-speech': 'não ouvi nada — toque no microfone e fale de novo',
  network: 'o reconhecimento de voz precisa de internet — confira a conexão',
  failed: 'o reconhecimento de voz falhou — tente de novo ou use o teclado',
};

export function VocabularyPractice() {
  const { words, ready, update } = useVocabulary();
  // What's being practiced, so "keep going" can deal more of the same. All means today's mix.
  const [deck, setDeck] = useState<{ category: string; size: number }>({ category: ALL_CATEGORIES, size: DEFAULT_SESSION_SIZE });
  const category = deck.category;
  const [session, setSession] = useState<VocabSession | null>(null);
  const savedSize = useSyncExternalStore(subscribeStorage, loadSessionSize, () => DEFAULT_SESSION_SIZE);
  const [pickedSize, setPickedSize] = useState<SessionSize | null>(null);
  const size = pickedSize ?? savedSize;
  // The saved choice; the server renders the default. A pick made here wins
  // even when storage is blocked and the save goes nowhere.
  const saved = useSyncExternalStore(subscribeStorage, loadMode, () => DEFAULT_MODE);
  const [picked, setPicked] = useState<AnswerMode | null>(null);
  const mode = picked ?? saved;
  const speech = useSpeech();
  const stopSpeech = speech.stop;
  const { enterDeck, leaveDeck } = useDeckHistory(
    useCallback(() => {
      stopSpeech();
      setSession(null);
    }, [stopSpeech]),
  );

  const chooseMode =(next: AnswerMode) => {
    speech.stop();
    setPicked(next);
    saveMode(next);
  };

  // A saved "voice" falls back to typing, without losing the choice, in a
  // browser that can't do it and in the deck that is always typed. The setup
  // screen is not in any deck, so the toggle stays free there.
  const typedOnly = session !== null && category === PAST_TENSE_CATEGORY;
  const effectiveMode: AnswerMode = mode === 'voice' && (typedOnly || speech.supported === false) ? 'type' : mode;
  const toggle = (compact: boolean) => (
    <ModeToggle
      mode={effectiveMode}
      voiceSupported={speech.supported}
      typedOnly={typedOnly}
      compact={compact}
      onMode={chooseMode}
    />
  );

  const start = (chosen: Word[]) => setSession(startVocabSession(chosen));

  /** Today's mix keeps its priority order; a subject is just shuffled. */
  const deal = (chosen: string, count: number): VocabSession =>
    chosen === ALL_CATEGORIES
      ? dealVocabSession(dailyQueue(dailyMix(deckOf(words, ALL_CATEGORIES), count)))
      : startVocabSession(topicDeck(deckOf(words, chosen), count));

  const backHome = () => {
    setSession(null);
    leaveDeck();
  };

  if (session === null) {
    return (
      <Home
        words={words}
        ready={ready}
        mode={effectiveMode}
        toggle={toggle(false)}
        size={size}
        onSize={(next) => {
          setPickedSize(next);
          saveSessionSize(next);
        }}
        onStart={(chosen, count) => {
          setDeck({ category: chosen, size: count });
          enterDeck();
          setSession(deal(chosen, count));
        }}
      />
    );
  }

  if (isFinished(session)) {
    const summary = summarize(session);
    return (
      <Summary
        session={session}
        onAgain={() => {
          const next = deal(category, deck.size);
          // Today's mix can run out; home says so instead of an empty summary.
          if (next.queue.length === 0) backHome();
          else setSession(next);
        }}
        onMissed={() => start(summary.missed.map((answer) => answer.word))}
        onSetup={backHome}
      />
    );
  }

  return (
    // Keyed by word: every new one gets an empty, focused field.
    <Play
      key={session.index}
      session={session}
      mode={effectiveMode}
      toggle={toggle(true)}
      speech={speech}
      onAnswer={(typed) => {
        const word = currentWord(session);
        if (word === null) return;
        speech.stop();
        const verdict = checkAnswer(word, typed);
        setSession(answerWord(session, typed, verdict));
        update((overlay) => recordAnswer(overlay, word.id, verdict === 'right'));
      }}
      onNext={() => {
        speech.stop();
        setSession(nextWord(session));
      }}
      onStop={() => {
        speech.stop();
        setSession(stopSession(session));
      }}
    />
  );
}

// ---------------------------------------------------------------------------

/** `compact` is the in-game version: icons only, so it fits beside the deck on a phone. */
function ModeToggle({
  mode,
  voiceSupported,
  typedOnly,
  compact,
  onMode,
}: {
  mode: AnswerMode;
  voiceSupported: boolean | null;
  typedOnly: boolean;
  compact: boolean;
  onMode: (mode: AnswerMode) => void;
}) {
  const options = [
    { value: 'type', label: 'Teclado', Icon: Keyboard, disabled: false },
    { value: 'voice', label: 'Voz', Icon: Microphone, disabled: typedOnly || voiceSupported === false },
  ] as const;
  const voiceNote = typedOnly
    ? 'Esta categoria é só digitada.'
    : voiceSupported === false
      ? 'Responder por voz precisa do Chrome ou do Edge.'
      : null;

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex gap-1 rounded-md border border-line bg-surface p-1" role="radiogroup" aria-label="Como responder">
        {options.map(({ value, label, Icon, disabled }) => {
          const active = value === mode;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              title={compact ? (disabled ? (voiceNote ?? label) : label) : undefined}
              disabled={disabled}
              onClick={() => onMode(value)}
              className={`flex items-center gap-2 rounded-sm text-sm font-medium ${compact ? 'h-9 w-9 justify-center' : 'h-11 w-11 justify-center sm:w-auto sm:px-4'} ${
                active ? 'bg-raised text-accent' : 'text-muted hover:text-accent'
              } disabled:cursor-not-allowed disabled:text-dim disabled:hover:text-dim`}
            >
              <Icon size={compact ? 18 : 16} weight="bold" aria-hidden="true" />
              {!compact && <span className="hidden sm:inline">{label}</span>}
            </button>
          );
        })}
      </div>
      {voiceNote !== null && !compact && <span className="text-xs text-dim">{voiceNote}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------

const HERO = 'flex flex-col rounded-xl border border-line-strong bg-raised p-5 sm:p-7';
const HERO_TITLE = 'font-display text-[1.625rem] leading-tight font-semibold sm:text-[2rem]';

/** "gaveta, tigela, chaleira…": the words behind a number, so it means something. */
function sampleOf(words: readonly Word[]): string {
  const shown = words.slice(0, 3).map(promptOf).join(', ');
  return words.length > 3 ? `${shown}…` : shown;
}

/** Where today's new words come from. */
function freshLabel(fresh: readonly Word[], practiced: readonly Word[]): string {
  const names = categoriesOf(fresh);
  if (names.length === 0) return 'Nenhuma nesta sessão';
  if (names.length > 1) return names.length === 2 ? names.join(' e ') : `${names[0]} e outras`;
  const started = practiced.some((word) => word.category === names[0] && word.lastSeen !== null);
  return `${started ? 'Continuando' : 'Começando'} ${names[0]}`;
}

function Home({
  words,
  ready,
  mode,
  toggle,
  size,
  onSize,
  onStart,
}: {
  words: Word[];
  ready: boolean;
  mode: AnswerMode;
  toggle: ReactNode;
  size: SessionSize;
  onSize: (size: SessionSize) => void;
  onStart: (category: string, count: number) => void;
}) {
  const practiced = useMemo(() => deckOf(words, ALL_CATEGORIES), [words]);
  const firstVisit = ready && !hasPracticed(words);
  const count = firstVisit ? FIRST_SESSION_SIZE : size;
  // Only once storage is in: "today" and the stats don't exist on the server.
  const mix = useMemo(() => (ready ? dailyMix(practiced, count, isoDate()) : null), [ready, practiced, count]);

  const pastTense = wordsIn(words, PAST_TENSE_CATEGORY);
  const topics = categoriesOf(words).filter((name) => name !== PAST_TENSE_CATEGORY);

  return (
    <div className="flex flex-col gap-8">
      {mix === null ? (
        <section className={`${HERO} min-h-80`} aria-busy="true" aria-label="Carregando sua sessão" />
      ) : mixSize(mix) === 0 ? (
        <section className={HERO} aria-labelledby="today-title">
          <div className="flex flex-col gap-1.5">
            <h1 id="today-title" className={HERO_TITLE}>
              Tudo em dia
            </h1>
            <p className="text-[15px] text-muted">Nada para revisar agora. Se quiser, treine um assunto abaixo.</p>
          </div>
        </section>
      ) : firstVisit ? (
        <section className={`${HERO} gap-7 sm:flex-row sm:items-center sm:justify-between`} aria-labelledby="today-title">
          <div className="flex flex-col gap-2.5">
            <h1 id="today-title" className={HERO_TITLE}>
              Comece com {mixSize(mix)} palavras
            </h1>
            <p className="text-[15px] leading-normal text-muted">
              A palavra aparece em português e você {mode === 'voice' ? 'fala' : 'digita'} em inglês. O que você errar volta
              primeiro na próxima sessão.
            </p>
          </div>
          <button type="button" className={`${PRIMARY} shrink-0`} onClick={() => onStart(ALL_CATEGORIES, count)}>
            Começar por {mix.fresh[0]?.category}
          </button>
        </section>
      ) : (
        <section className={`${HERO} gap-4 sm:gap-7`} aria-labelledby="today-title">
          <div className="flex flex-col gap-1.5">
            <h1 id="today-title" className={HERO_TITLE}>
              Sua sessão de hoje
            </h1>
            <p className="hidden text-[15px] text-muted sm:block">Primeiro o que você errou, depois o que está esquecendo, depois palavras novas.</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
            <MixTile count={mix.review.length} color="text-bad" label="Para revisar" note={sampleOf(mix.review) || 'Nenhuma agora'} />
            <MixTile count={mix.stale.length} color="text-warn" label="Faz tempo" note="Sem ver há mais de 7 dias" />
            <MixTile count={mix.fresh.length} color="text-accent" label="Novas" note={freshLabel(mix.fresh, practiced)} />
          </div>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap items-start gap-2 sm:gap-4">
              <SizePicker size={size} onSize={onSize} />
              {toggle}
            </div>
            <button type="button" className={`${PRIMARY} w-full sm:w-auto`} onClick={() => onStart(ALL_CATEGORIES, count)}>
              Começar {mixSize(mix)} {mixSize(mix) === 1 ? 'carta' : 'cartas'}
            </button>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4" aria-labelledby="topics-title">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 id="topics-title" className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">
            {firstVisit ? 'Ou escolha outro assunto' : 'Ou treine um assunto'}
          </h2>
          {!firstVisit && (
            <div className="flex flex-wrap gap-3.5 text-[13px] text-muted">
              <LegendItem swatch="bg-accent" label="Firmes" />
              <LegendItem swatch="bg-accent/45" label="Aprendendo" />
              <LegendItem swatch="bg-line" label="Novas" />
            </div>
          )}
        </div>

        {pastTense.length > 0 && (
          <button
            type="button"
            disabled={!ready}
            onClick={() => onStart(PAST_TENSE_CATEGORY, count)}
            className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-line bg-surface p-4 text-left hover:border-accent"
          >
            <span className="flex min-w-56 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-semibold">{PAST_TENSE_CATEGORY}</span>
              <span className="text-[13px] text-muted">Você vê o presente e escreve o passado</span>
            </span>
            {/* An example of the question, in place of explaining it further. */}
            <span className="flex items-center gap-2 rounded-md bg-bg px-2.5 py-1.5 font-mono text-[13px]" lang="en" aria-hidden="true">
              <span className="text-muted">go</span>
              <ArrowRight size={12} weight="bold" className="text-dim" />
              <span className="font-semibold text-accent">went</span>
            </span>
            <span className="flex min-w-56 flex-1 items-center gap-3">
              {firstVisit ? (
                <span className="font-mono text-xs text-muted">{pastTense.length} palavras</span>
              ) : (
                <>
                  <ProgressBar progress={progressOf(pastTense)} />
                  <ProgressCount progress={progressOf(pastTense)} />
                </>
              )}
            </span>
          </button>
        )}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((name) => {
            const deck = wordsIn(words, name);
            const progress = progressOf(deck);
            return (
              <button
                key={name}
                type="button"
                disabled={!ready}
                onClick={() => onStart(name, count)}
                className="flex min-h-16 flex-col justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-left hover:border-accent"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{name}</span>
                  {firstVisit ? <span className="font-mono text-xs text-muted">{deck.length}</span> : <ProgressCount progress={progress} />}
                </span>
                {firstVisit ? (
                  <span className="truncate text-[13px] text-muted" lang="pt-BR">
                    {sampleOf(deck)}
                  </span>
                ) : (
                  <ProgressBar progress={progress} />
                )}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function MixTile({ count, color, label, note }: { count: number; color: string; label: string; note: string }) {
  return (
    // A row on a phone, so the start button stays on the first screen.
    <div className="flex items-center gap-3 rounded-lg bg-bg px-3.5 py-2.5 sm:flex-col sm:items-start sm:gap-1.5 sm:p-4">
      <span className={`w-8 shrink-0 font-mono text-xl font-semibold sm:w-auto sm:text-3xl ${color}`}>{count}</span>
      <span className="flex min-w-0 flex-col sm:gap-1.5">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-[13px] text-muted">{note}</span>
      </span>
    </div>
  );
}

function SizePicker({ size, onSize }: { size: SessionSize; onSize: (size: SessionSize) => void }) {
  return (
    <div className="flex gap-1 rounded-md border border-line bg-surface p-1" role="radiogroup" aria-label="Tamanho da sessão">
      {SESSION_SIZES.map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={value === size}
          aria-label={`${value} cartas`}
          onClick={() => onSize(value)}
          className={`h-11 min-w-11 rounded-sm font-mono text-sm font-semibold ${
            value === size ? 'bg-raised text-accent' : 'text-muted hover:text-accent'
          }`}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-xs ${swatch}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function ProgressBar({ progress }: { progress: WordProgress }) {
  const percent = (part: number) => `${progress.total === 0 ? 0 : (part / progress.total) * 100}%`;
  return (
    <span className="flex h-1.5 w-full min-w-0 overflow-hidden rounded-full bg-line" aria-hidden="true">
      <span className="bg-accent" style={{ width: percent(progress.firm) }} />
      <span className="bg-accent/45" style={{ width: percent(progress.learning) }} />
    </span>
  );
}

function ProgressCount({ progress }: { progress: WordProgress }) {
  return (
    <span className="shrink-0 font-mono text-xs text-muted">
      {progress.firm}/{progress.total}
      <span className="sr-only"> firmes</span>
    </span>
  );
}

function Play({
  session,
  mode,
  toggle,
  speech,
  onAnswer,
  onNext,
  onStop,
}: {
  session: VocabSession;
  mode: AnswerMode;
  toggle: ReactNode;
  speech: ReturnType<typeof useSpeech>;
  onAnswer: (typed: string) => void;
  onNext: () => void;
  onStop: () => void;
}) {
  const word = currentWord(session);
  const answered = isAnswered(session);
  const answer = answered ? session.answers[session.index] : null;
  const [typed, setTyped] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const voice = mode === 'voice';
  const { listening, error } = speech;

  /**
   * What the recognizer heard goes into the field — never straight in as the
   * answer. Speaking again clears it first, so what you see is always this
   * take; in voice mode the keyboard can't edit it.
   */
  const listen = () => {
    setTyped('');
    speech.listen((guesses) => {
      setTyped(guesses[0].trim().replace(/[.!?]+$/, ''));
      input.current?.focus();
    });
  };

  if (word === null) return null;

  const remaining = session.queue.length - session.answers.length;
  // The cards still under this one, drawn as up to two edges peeking out.
  const below = Math.min(session.queue.length - session.index - 1, 2);
  const style = answer === null ? null : VERDICT_STYLE[answer.verdict];

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-4" aria-label="Praticando">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onStop}
          aria-label="Parar"
          title="Parar"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-muted hover:text-accent"
        >
          <X size={20} weight="bold" aria-hidden="true" />
        </button>
        <span className="flex-1 text-center text-sm text-muted">
          <span className="font-mono text-fg">{remaining}</span> {remaining === 1 ? 'carta restante' : 'cartas restantes'}
        </span>
        {toggle}
      </div>

      {/* One form for both faces: Enter checks on the front and, with the field still focused, deals the next card on the back. */}
      <form
        className="relative pb-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (answered) onNext();
          else if (typed.trim() !== '') onAnswer(typed);
        }}
      >
        {below >= 2 && (
          <div
            className="absolute inset-x-0 top-0 bottom-4 origin-bottom translate-y-4 scale-x-90 rounded-xl border border-line-soft bg-sidebar"
            aria-hidden="true"
          />
        )}
        {below >= 1 && (
          <div
            className="absolute inset-x-0 top-0 bottom-4 origin-bottom translate-y-2 scale-x-95 rounded-xl border border-line bg-surface"
            aria-hidden="true"
          />
        )}

        <div className="relative perspective-[1400px]">
          {/* Both faces share one grid cell, so the card is as tall as the taller one. */}
          <div
            className={`grid grid-cols-1 transition-transform duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] transform-3d motion-reduce:transition-none ${
              answered ? 'rotate-y-180' : ''
            }`}
          >
            <div
              className={`col-start-1 row-start-1 flex min-h-80 flex-col gap-3 rounded-xl border border-line-strong bg-raised p-5 backface-hidden ${
                answered ? 'pointer-events-none' : ''
              }`}
            >
              <span className="self-start rounded-full border border-line-strong px-2.5 py-1 text-xs font-semibold text-muted">
                {word.category}
              </span>
              <div className="flex flex-1 items-center justify-center py-4 text-center">
                <span className="font-display text-4xl font-semibold break-words sm:text-5xl" lang={isPastTense(word) ? 'en' : 'pt-BR'}>
                  {promptOf(word)}
                </span>
              </div>

              <label htmlFor="vocabulary-answer" className="text-sm font-semibold">
                {isPastTense(word) ? 'No passado' : 'Em inglês'}
              </label>
              <div
                className={`relative flex h-14 items-center gap-1.5 rounded-md border bg-bg pr-1.5 pl-4 ${
                  listening ? 'border-ok' : 'border-line-strong focus-within:border-accent'
                }`}
              >
                <input
                  id="vocabulary-answer"
                  ref={input}
                  value={answered ? (answer?.typed ?? typed) : typed}
                  onChange={(event) => setTyped(event.target.value)}
                  onKeyDown={(event) => {
                    // The field takes no typing in voice mode, so Space means
                    // "listen (again)" — or, mid-take, "stop listening".
                    if (voice && !answered && event.key === ' ') {
                      event.preventDefault();
                      if (listening) speech.stop();
                      else listen();
                    }
                  }}
                  readOnly={answered || voice}
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  lang="en"
                  placeholder={listening ? '' : voice ? 'toque no microfone' : 'digite e aperte Enter'}
                  className="h-full min-w-0 flex-1 bg-transparent font-mono text-base text-fg sm:text-lg outline-none placeholder:text-dim"
                />
                {listening && (
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-mono text-base text-ok sm:text-lg" aria-hidden="true">
                    ouvindo
                    {[0, 0.2, 0.4].map((delay) => (
                      <span key={delay} className="animate-listening-dot" style={{ animationDelay: `${delay}s` }}>
                        .
                      </span>
                    ))}
                  </span>
                )}
                {voice && !answered && (
                  <button
                    type="button"
                    onClick={listening ? speech.stop : listen}
                    aria-label={listening ? 'Parar de ouvir' : 'Falar a resposta'}
                    aria-pressed={listening}
                    title={listening ? 'Parar de ouvir' : 'Falar a resposta (Espaço)'}
                    className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-sm border-2 hover:brightness-110 ${
                      listening ? 'border-ok bg-ok/15 text-ok' : 'border-accent bg-raised text-accent'
                    }`}
                  >
                    <Microphone size={listening ? 18 : 20} weight="bold" aria-hidden="true" />
                    {/* Green and moving: the mic is open. */}
                    {listening && (
                      <span className="flex h-1.5 items-center gap-0.5" aria-hidden="true">
                        {[0, 0.15, 0.3, 0.45].map((delay) => (
                          <span
                            key={delay}
                            className="h-full w-[3px] origin-center animate-listening rounded-full bg-ok"
                            style={{ animationDelay: `${delay}s` }}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                )}
                <button
                  type="submit"
                  aria-label="Conferir"
                  title="Conferir (Enter)"
                  tabIndex={answered ? -1 : undefined}
                  // Keeps the focus — and a phone's keyboard — on the field.
                  onMouseDown={(event) => event.preventDefault()}
                  disabled={!answered && (listening || typed.trim() === '')}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-accent text-bg hover:brightness-110 disabled:bg-line disabled:text-muted disabled:hover:brightness-100"
                >
                  <Check size={20} weight="bold" aria-hidden="true" />
                </button>
              </div>

              {voice && !answered && (
                <span className={`text-sm ${error !== null && !listening ? 'text-bad' : 'text-muted'}`} role="status">
                  {listening
                    ? 'Ouvindo… fale a palavra em inglês'
                    : error !== null
                      ? SPEECH_ERRORS[error]
                      : typed === ''
                        ? 'Toque no microfone (ou Espaço) e fale.'
                        : 'Se estiver certo, aperte ✓. Se não, fale de novo.'}
                </span>
              )}
            </div>

            {/* The back stays empty until you answer, so the answer is never in the page early. */}
            <button
              type="submit"
              tabIndex={answered ? undefined : -1}
              aria-hidden={!answered}
              className={`col-start-1 row-start-1 flex min-h-80 rotate-y-180 flex-col gap-4 rounded-xl border-2 bg-raised p-5 text-left backface-hidden ${
                style?.border ?? 'border-line'
              } ${answered ? '' : 'pointer-events-none'}`}
            >
              {answer !== null && <CardBack verdict={answer.verdict} word={word} typed={answer.typed} />}
            </button>
          </div>
        </div>
      </form>

      {answer !== null && style !== null && (
        <span className="sr-only" role="status">
          {style.label}: {word.english}
        </span>
      )}
    </section>
  );
}

function CardBack({ verdict, word, typed }: { verdict: Verdict; word: Word; typed: string }) {
  const style = VERDICT_STYLE[verdict];

  return (
    <>
      <span className={`flex items-center gap-2 text-sm font-semibold ${style.text}`}>
        {verdict === 'right' ? (
          <Check size={20} weight="bold" aria-hidden="true" />
        ) : (
          <X size={20} weight="bold" aria-hidden="true" />
        )}
        {style.label}
        {verdict === 'almost' && ' — confira a grafia'}
      </span>
      <span className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <span className="text-muted">
          {isPastTense(word) && (
            <>
              <span className="font-mono" lang="en">
                {promptOf(word)}
              </span>
              {' · '}
            </>
          )}
          <span lang="pt-BR">{word.portuguese}</span>
        </span>
        <span className="font-mono text-3xl font-semibold break-all sm:text-4xl" lang="en">
          {word.english}
        </span>
        {word.alternatives.length > 0 && (
          <span className="text-sm text-muted">também: {word.alternatives.join(', ')}</span>
        )}
        <span className="mt-3 text-sm text-muted">
          você:{' '}
          <span className={`font-mono ${style.text} ${verdict === 'right' ? '' : 'line-through'}`} lang="en">
            {typed}
          </span>
        </span>
      </span>
      <span className="flex items-center justify-center gap-2 border-t border-line pt-3.5 text-sm font-semibold text-accent">
        Toque no cartão<span className="hidden sm:inline"> ou aperte Enter</span> para a próxima
        <ArrowRight size={18} weight="bold" aria-hidden="true" />
      </span>
    </>
  );
}

function Summary({
  session,
  onAgain,
  onMissed,
  onSetup,
}: {
  session: VocabSession;
  onAgain: () => void;
  onMissed: () => void;
  onSetup: () => void;
}) {
  const { right, wrong, missed } = summarize(session);

  return (
    <section className="flex flex-col gap-8" aria-labelledby="summary-title">
      <h1 id="summary-title" className="font-display text-2xl font-semibold">
        {session.stopped ? 'Sessão encerrada' : 'Fim da sessão'}
      </h1>

      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <div className="flex flex-col gap-1 rounded-md border border-line bg-surface p-4">
          <span className="text-sm text-muted">Acertos</span>
          <span className="font-mono text-3xl font-semibold text-ok">{right}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-md border border-line bg-surface p-4">
          <span className="text-sm text-muted">Erros</span>
          <span className="font-mono text-3xl font-semibold text-bad">{wrong}</span>
        </div>
      </div>

      {missed.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">Palavras que você errou</h2>
          <ul className="flex flex-col divide-y divide-line-soft rounded-md border border-line bg-surface">
            {missed.map((answer) => (
              <li key={answer.word.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3">
                <span className="min-w-32 font-medium">{promptOf(answer.word)}</span>
                <span className="font-mono text-ok">{answer.word.english}</span>
                <span className={`font-mono text-sm line-through ${answer.verdict === 'almost' ? 'text-warn' : 'text-bad'}`}>
                  {answer.typed}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {missed.length > 0 && (
          <button type="button" className={PRIMARY} onClick={onMissed}>
            Só as erradas
          </button>
        )}
        <button type="button" className={SECONDARY} onClick={onAgain}>
          Continuar treinando
        </button>
        <button type="button" className={SECONDARY} onClick={onSetup}>
          Voltar ao início
        </button>
        <Link href="/vocabulary/words" className={SECONDARY}>
          Ver palavras
        </Link>
      </div>
    </section>
  );
}
