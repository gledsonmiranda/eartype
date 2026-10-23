'use client';

/**
 * Vocabulary practice: pick a category, then a Portuguese word at a time —
 * type the English, Enter to check, Enter again for the next one. In voice
 * mode the field is the microphone's alone: what it heard lands there, you
 * speak again if it misheard, and you are the one who confirms. Every answer
 * is saved to the word's stats as you go, so stopping loses nothing.
 */

import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Keyboard, Microphone, Stop, X } from '@phosphor-icons/react';
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

const VERDICT_STYLE: Record<Verdict, { label: string; className: string }> = {
  right: { label: 'Certo', className: 'border-ok text-ok' },
  almost: { label: 'Quase', className: 'border-warn text-warn' },
  wrong: { label: 'Errado', className: 'border-bad text-bad' },
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
  const toggle = <ModeToggle mode={effectiveMode} voiceSupported={speech.supported} onMode={chooseMode} />;

  const start = (chosen: Word[]) => setSession(startVocabSession(chosen));

  if (session === null) {
    return (
      <Setup
        words={words}
        ready={ready}
        category={category}
        mode={effectiveMode}
        toggle={toggle}
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
      toggle={toggle}
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

function ModeToggle({
  mode,
  voiceSupported,
  onMode,
}: {
  mode: AnswerMode;
  voiceSupported: boolean | null;
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
              disabled={disabled}
              onClick={() => onMode(value)}
              className={`flex items-center gap-2 rounded-sm px-4 py-1.5 text-sm font-medium ${
                active ? 'bg-raised text-accent' : 'text-muted hover:text-accent'
              } disabled:cursor-not-allowed disabled:text-dim disabled:hover:text-dim`}
            >
              <Icon size={16} weight="bold" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
      {voiceSupported === false && (
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

  const position = session.index + 1;
  const total = session.queue.length;

  return (
    <section className="flex flex-col gap-8" aria-label="Praticando">
      <div className="flex flex-wrap items-center gap-4">
        <div className="h-1.5 min-w-32 flex-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div className="h-full bg-accent" style={{ width: `${(session.answers.length / total) * 100}%` }} />
        </div>
        <span className="font-mono text-sm text-muted">
          {position} / {total}
        </span>
        {toggle}
        <button type="button" onClick={onStop} className={SECONDARY}>
          <Stop size={16} weight="bold" aria-hidden="true" />
          Parar
        </button>
      </div>

      <div className="flex flex-col items-center gap-2 rounded-md border border-line bg-surface px-6 py-12 text-center">
        <span className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">{word.category}</span>
        <span className="font-display text-4xl font-semibold break-words sm:text-5xl" lang="pt-BR">
          {word.portuguese}
        </span>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (answered) onNext();
          else if (typed.trim() !== '') onAnswer(typed);
        }}
      >
        <div className="flex flex-col gap-2 text-sm">
          <label htmlFor="vocabulary-answer" className="font-semibold">
            Em inglês
          </label>
          <div className="flex gap-2">
            <div className="relative flex min-w-0 flex-1">
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
                placeholder={listening ? '' : voice ? 'toque no microfone e fale' : 'digite e aperte Enter'}
                className={`h-14 w-full rounded-sm border bg-bg px-4 font-mono text-lg text-fg outline-none placeholder:text-dim ${
                  listening
                    ? 'border-ok'
                    : answer === null
                      ? 'border-line focus:border-accent'
                      : VERDICT_STYLE[answer.verdict].className
                }`}
              />
              {listening && (
                <span className="pointer-events-none absolute inset-0 flex items-center px-4 font-mono text-lg text-ok" aria-hidden="true">
                  ouvindo
                  {[0, 0.2, 0.4].map((delay) => (
                    <span key={delay} className="animate-listening-dot" style={{ animationDelay: `${delay}s` }}>
                      .
                    </span>
                  ))}
                </span>
              )}
            </div>
            {voice && !answered && (
              <button
                type="button"
                onClick={listening ? speech.stop : listen}
                aria-label={listening ? 'Parar de ouvir' : 'Falar a resposta'}
                aria-pressed={listening}
                title={listening ? 'Parar de ouvir' : 'Falar a resposta (Espaço)'}
                className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-sm border-2 hover:brightness-110 ${
                  listening ? 'border-ok bg-ok/15 text-ok' : 'border-accent bg-raised text-accent'
                }`}
              >
                <Microphone size={listening ? 22 : 26} weight="bold" aria-hidden="true" />
                {/* Green and moving: the mic is open. */}
                {listening && (
                  <span className="flex h-2 items-center gap-0.5" aria-hidden="true">
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
          </div>
        </div>

        {voice && !answered && (
          <span className={`text-sm ${error !== null && !listening ? 'text-bad' : 'text-muted'}`} role="status">
            {listening
              ? 'Ouvindo… fale a palavra em inglês'
              : error !== null
                ? SPEECH_ERRORS[error]
                : typed === ''
                  ? 'Toque no microfone (ou Espaço) e fale. O que for entendido aparece no campo.'
                  : 'Se estiver certo, aperte Enter. Se não, toque no microfone e fale de novo.'}
          </span>
        )}

        {answer !== null && <Feedback verdict={answer.verdict} word={word} />}

        <button type="submit" className={`${PRIMARY} self-start`} disabled={!answered && (listening || typed.trim() === '')}>
          {answered ? 'Próxima' : 'Conferir'}
          <ArrowRight size={18} weight="bold" aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}

function Feedback({ verdict, word }: { verdict: Verdict; word: Word }) {
  const style = VERDICT_STYLE[verdict];
  const alternatives = word.alternatives.length > 0 ? ` (também: ${word.alternatives.join(', ')})` : '';

  return (
    <div role="status" className={`flex items-start gap-3 rounded-md border px-4 py-3 ${style.className}`}>
      {verdict === 'right' ? (
        <Check size={20} weight="bold" aria-hidden="true" className="mt-0.5 shrink-0" />
      ) : (
        <X size={20} weight="bold" aria-hidden="true" className="mt-0.5 shrink-0" />
      )}
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">
          {style.label}
          {verdict === 'almost' && ' — confira a grafia'}
        </span>
        <span className="text-fg">
          <span className="font-mono text-base">{word.english}</span>
          <span className="text-muted">{alternatives}</span>
        </span>
      </div>
    </div>
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
