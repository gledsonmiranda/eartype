'use client';

/**
 * Vocabulary practice: pick a category, then a deck of cards, a Portuguese
 * word on each front — type the English, Enter to check and the card flips
 * to the answer, Enter (or a tap on it) for the next one. Everything sits on
 * the card, so on a phone it all fits above the keyboard. In voice
 * mode the field is the microphone's alone: what it heard lands there, you
 * speak again if it misheard, and you are the one who confirms. Every answer
 * is saved to the word's stats as you go, so stopping loses nothing.
 */

import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Keyboard, Microphone, X } from '@phosphor-icons/react';
import { useVocabulary } from '@/app/vocabulary/use-vocabulary';
import { checkAnswer, type Verdict } from '@/lib/vocabulary/check';
import { DEFAULT_MODE, loadMode, saveMode, type AnswerMode } from '@/lib/vocabulary/mode';
import {
  ALL_CATEGORIES,
  answerWord,
  currentWord,
  isAnswered,
  isFinished,
  nextWord,
  startVocabSession,
  stopSession,
  summarize,
  wordsIn,
  type VocabSession,
} from '@/lib/vocabulary/session';
import { categoriesOf, recordAnswer, type Word } from '@/lib/vocabulary/words';
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
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [session, setSession] = useState<VocabSession | null>(null);
  // The saved choice; the server renders the default. A pick made here wins
  // even when storage is blocked and the save goes nowhere.
  const saved = useSyncExternalStore(subscribeStorage, loadMode, () => DEFAULT_MODE);
  const [picked, setPicked] = useState<AnswerMode | null>(null);
  const mode = picked ?? saved;
  const speech = useSpeech();

  const chooseMode = (next: AnswerMode) => {
    speech.stop();
    setPicked(next);
    saveMode(next);
  };

  // A saved "voice" in a browser that can't do it falls back to typing.
  const effectiveMode: AnswerMode = mode === 'voice' && speech.supported === false ? 'type' : mode;
  const toggle = (compact: boolean) => (
    <ModeToggle mode={effectiveMode} voiceSupported={speech.supported} compact={compact} onMode={chooseMode} />
  );

  const start = (chosen: Word[]) => setSession(startVocabSession(chosen));

  if (session === null) {
    return (
      <Setup
        words={words}
        ready={ready}
        category={category}
        mode={effectiveMode}
        toggle={toggle(false)}
        onCategory={setCategory}
        onStart={() => start(wordsIn(words, category))}
      />
    );
  }

  if (isFinished(session)) {
    const summary = summarize(session);
    return (
      <Summary
        session={session}
        onAgain={() => start(wordsIn(words, category))}
        onMissed={() => start(summary.missed.map((answer) => answer.word))}
        onSetup={() => setSession(null)}
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
  compact,
  onMode,
}: {
  mode: AnswerMode;
  voiceSupported: boolean | null;
  compact: boolean;
  onMode: (mode: AnswerMode) => void;
}) {
  const options = [
    { value: 'type', label: 'Teclado', Icon: Keyboard, disabled: false },
    { value: 'voice', label: 'Voz', Icon: Microphone, disabled: voiceSupported === false },
  ] as const;

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
              aria-label={compact ? label : undefined}
              title={compact ? (disabled ? 'Responder por voz precisa do Chrome ou do Edge' : label) : undefined}
              disabled={disabled}
              onClick={() => onMode(value)}
              className={`flex items-center gap-2 rounded-sm text-sm font-medium ${compact ? 'h-9 w-9 justify-center' : 'px-4 py-1.5'} ${
                active ? 'bg-raised text-accent' : 'text-muted hover:text-accent'
              } disabled:cursor-not-allowed disabled:text-dim disabled:hover:text-dim`}
            >
              <Icon size={compact ? 18 : 16} weight="bold" aria-hidden="true" />
              {!compact && label}
            </button>
          );
        })}
      </div>
      {voiceSupported === false && !compact && (
        <span className="text-xs text-dim">Responder por voz precisa do Chrome ou do Edge.</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Setup({
  words,
  ready,
  category,
  mode,
  toggle,
  onCategory,
  onStart,
}: {
  words: Word[];
  ready: boolean;
  category: string;
  mode: AnswerMode;
  toggle: ReactNode;
  onCategory: (category: string) => void;
  onStart: () => void;
}) {
  const categories = categoriesOf(words);
  const count = wordsIn(words, category).length;
  const chips = [
    { value: ALL_CATEGORIES, label: 'Todas', count: words.length },
    ...categories.map((name) => ({ value: name, label: name, count: wordsIn(words, name).length })),
  ];

  return (
    <section className="flex flex-col gap-8" aria-labelledby="setup-title">
      {/* No wrapping here: the voice text is longer, and a wrap would move the toggle when you switch. */}
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 id="setup-title" className="font-display text-2xl font-semibold">
            Escolha uma categoria
          </h1>
          {/* Room for the longer voice text, so the chips below stay put when you switch. */}
          <p className="min-h-[3lh] text-sm text-muted sm:min-h-[2lh]">
            {mode === 'voice'
              ? 'A palavra aparece em português; você fala em inglês, confere o que foi entendido e aperta Enter.'
              : 'A palavra aparece em português; você digita em inglês e aperta Enter.'}
          </p>
        </div>
        {toggle}
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Categoria">
        {chips.map((chip) => {
          const active = chip.value === category;
          return (
            <button
              key={chip.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onCategory(chip.value)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${
                active ? 'border-accent bg-raised text-accent' : 'border-line bg-surface text-fg hover:border-accent'
              }`}
            >
              {chip.label}
              <span className="font-mono text-xs text-muted">{chip.count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className={PRIMARY} disabled={!ready || count === 0} onClick={onStart}>
          Começar
          <ArrowRight size={18} weight="bold" aria-hidden="true" />
        </button>
        <span className="text-sm text-muted">
          {count} {count === 1 ? 'palavra' : 'palavras'}, em ordem aleatória
        </span>
      </div>
    </section>
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
                <span className="font-display text-4xl font-semibold break-words sm:text-5xl" lang="pt-BR">
                  {word.portuguese}
                </span>
              </div>

              <label htmlFor="vocabulary-answer" className="text-sm font-semibold">
                Em inglês
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
        <span className="text-muted" lang="pt-BR">
          {word.portuguese}
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
                <span className="min-w-32 font-medium">{answer.word.portuguese}</span>
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
          Treinar de novo
        </button>
        <button type="button" className={SECONDARY} onClick={onSetup}>
          Outra categoria
        </button>
        <Link href="/vocabulary/words" className={SECONDARY}>
          Ver palavras
        </Link>
      </div>
    </section>
  );
}
