'use client';

/**
 * Vocabulary practice: pick a category, then a Portuguese word at a time —
 * type the English, Enter to check, Enter again for the next one. Every
 * answer is saved to the word's stats as you go, so stopping loses nothing.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Stop, X } from '@phosphor-icons/react';
import { useVocabulary } from '@/app/vocabulary/use-vocabulary';
import { checkAnswer, type Verdict } from '@/lib/vocabulary/check';
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

const PRIMARY =
  'flex h-12 items-center justify-center gap-2 rounded-sm bg-accent px-8 text-base font-semibold text-bg hover:brightness-110 disabled:bg-line disabled:text-muted disabled:hover:brightness-100';
const SECONDARY =
  'flex h-11 items-center justify-center gap-2 rounded-sm border border-line bg-surface px-5 text-sm font-medium text-fg hover:border-accent hover:text-accent';

const VERDICT_STYLE: Record<Verdict, { label: string; className: string }> = {
  right: { label: 'Certo', className: 'border-ok text-ok' },
  almost: { label: 'Quase', className: 'border-warn text-warn' },
  wrong: { label: 'Errado', className: 'border-bad text-bad' },
};

export function VocabularyPractice() {
  const { words, ready, update } = useVocabulary();
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [session, setSession] = useState<VocabSession | null>(null);

  const start = (chosen: Word[]) => setSession(startVocabSession(chosen));

  if (session === null) {
    return (
      <Setup
        words={words}
        ready={ready}
        category={category}
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
      onAnswer={(typed) => {
        const word = currentWord(session);
        if (word === null) return;
        const verdict = checkAnswer(word, typed);
        setSession(answerWord(session, typed, verdict));
        update((overlay) => recordAnswer(overlay, word.id, verdict === 'right'));
      }}
      onNext={() => setSession(nextWord(session))}
      onStop={() => setSession(stopSession(session))}
    />
  );
}

// ---------------------------------------------------------------------------

function Setup({
  words,
  ready,
  category,
  onCategory,
  onStart,
}: {
  words: Word[];
  ready: boolean;
  category: string;
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
      <div className="flex flex-col gap-2">
        <h1 id="setup-title" className="font-display text-2xl font-semibold">
          Escolha uma categoria
        </h1>
        <p className="text-sm text-muted">
          A palavra aparece em português; você digita em inglês e aperta Enter.
        </p>
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
  onAnswer,
  onNext,
  onStop,
}: {
  session: VocabSession;
  onAnswer: (typed: string) => void;
  onNext: () => void;
  onStop: () => void;
}) {
  const word = currentWord(session);
  const answered = isAnswered(session);
  const answer = answered ? session.answers[session.index] : null;
  const [typed, setTyped] = useState('');

  if (word === null) return null;

  const position = session.index + 1;
  const total = session.queue.length;

  return (
    <section className="flex flex-col gap-8" aria-label="Praticando">
      <div className="flex items-center gap-4">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div className="h-full bg-accent" style={{ width: `${(session.answers.length / total) * 100}%` }} />
        </div>
        <span className="font-mono text-sm text-muted">
          {position} / {total}
        </span>
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
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Em inglês</span>
          <input
            value={answered ? (answer?.typed ?? typed) : typed}
            onChange={(event) => setTyped(event.target.value)}
            readOnly={answered}
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            lang="en"
            placeholder="digite e aperte Enter"
            className={`h-14 rounded-sm border bg-bg px-4 font-mono text-lg text-fg outline-none placeholder:text-dim ${
              answer === null ? 'border-line focus:border-accent' : VERDICT_STYLE[answer.verdict].className
            }`}
          />
        </label>

        {answer !== null && <Feedback verdict={answer.verdict} word={word} />}

        <button type="submit" className={`${PRIMARY} self-start`} disabled={!answered && typed.trim() === ''}>
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
