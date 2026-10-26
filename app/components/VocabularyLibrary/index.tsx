'use client';

/**
 * Every word, built-in and yours: search, filter by category, add, edit and
 * delete. Built-in words can be changed too — the change lives in your
 * overlay, and "Restaurar" puts the shipped version back.
 */

import { useMemo, useState } from 'react';
import { ArrowCounterClockwise, Check, PencilSimple, Plus, Trash, X } from '@phosphor-icons/react';
import { BUILT_IN, useVocabulary } from '@/app/vocabulary/use-vocabulary';
import { ALL_CATEGORIES, wordsIn } from '@/lib/vocabulary/session';
import {
  addWord,
  categoriesOf,
  cleanFields,
  deleteWord,
  editWord,
  isComplete,
  restoreWord,
  type Word,
  type WordFields,
} from '@/lib/vocabulary/words';

const INPUT =
  'h-10 w-full min-w-0 rounded-sm border border-line bg-bg px-3 text-sm text-fg outline-none placeholder:text-dim focus:border-accent';
const ICON_BUTTON =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-raised hover:text-accent';
const PRIMARY =
  'flex h-10 items-center justify-center gap-2 rounded-sm bg-accent px-5 text-sm font-semibold text-bg hover:brightness-110 disabled:bg-line disabled:text-muted disabled:hover:brightness-100';

const BUILT_IN_IDS = new Set(BUILT_IN.map((word) => word.id));

/** Accents don't get in the way of a search: `fogao` finds `fogão`. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function VocabularyLibrary() {
  const { words, overlay, ready, update } = useVocabulary();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const categories = categoriesOf(words);
  const shown = useMemo(() => {
    const needle = fold(query.trim());
    return wordsIn(words, category).filter(
      (word) =>
        needle === '' ||
        fold(word.portuguese).includes(needle) ||
        fold(word.english).includes(needle) ||
        word.alternatives.some((alternative) => fold(alternative).includes(needle)),
    );
  }, [words, category, query]);

  return (
    <section className="flex flex-col gap-6" aria-labelledby="words-title">
      {/* Stacked on a phone, so the count arriving after mount can't wrap the button down (layout shift). */}
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 id="words-title" className="font-display text-2xl font-semibold">
            Palavras
          </h1>
          <p className="text-sm text-muted">
            {ready ? `${words.length} palavras em ${categories.length} categorias` : 'Carregando…'}
          </p>
        </div>
        <button type="button" className={PRIMARY} onClick={() => setAdding((open) => !open)} aria-expanded={adding}>
          <Plus size={16} weight="bold" aria-hidden="true" />
          Adicionar palavra
        </button>
      </div>

      {adding && (
        <WordForm
          categories={categories}
          submitLabel="Adicionar"
          onCancel={() => setAdding(false)}
          onSave={(fields) => {
            update((current) => addWord(current, fields));
            setAdding(false);
            setCategory(ALL_CATEGORIES);
            setQuery(fields.portuguese);
          }}
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar em português ou inglês"
          aria-label="Buscar palavra"
          className={`${INPUT} sm:max-w-sm`}
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="Filtrar por categoria"
          className={`${INPUT} sm:w-56`}
        >
          <option value={ALL_CATEGORIES}>Todas as categorias</option>
          {categories.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-md border border-line bg-surface">
        <div className="hidden grid-cols-[1fr_1fr_1fr_8rem_6rem_5.5rem] gap-3 border-b border-line px-4 py-2 text-xs font-semibold tracking-[0.06em] text-muted uppercase md:grid">
          <span>Português</span>
          <span>Inglês</span>
          <span>Alternativas</span>
          <span>Categoria</span>
          <span>Acertos</span>
          <span className="sr-only">Ações</span>
        </div>

        {shown.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">Nenhuma palavra encontrada.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {shown.map((word) =>
              editing === word.id ? (
                <li key={word.id} className="p-4">
                  <WordForm
                    initial={word}
                    categories={categories}
                    submitLabel="Salvar"
                    onCancel={() => setEditing(null)}
                    onSave={(fields) => {
                      update((current) => editWord(current, word.id, fields));
                      setEditing(null);
                    }}
                  />
                </li>
              ) : (
                <WordRow
                  key={word.id}
                  word={word}
                  edited={BUILT_IN_IDS.has(word.id) && overlay.edited[word.id] !== undefined}
                  onEdit={() => setEditing(word.id)}
                  onRestore={() => update((current) => restoreWord(current, word.id))}
                  onDelete={() => {
                    if (window.confirm(`Apagar “${word.portuguese}”?`)) update((current) => deleteWord(current, word.id));
                  }}
                />
              ),
            )}
          </ul>
        )}
      </div>
    </section>
  );
}

function WordRow({
  word,
  edited,
  onEdit,
  onRestore,
  onDelete,
}: {
  word: Word;
  edited: boolean;
  onEdit: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const seen = word.timesRight + word.timesWrong;

  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-sm md:grid-cols-[1fr_1fr_1fr_8rem_6rem_5.5rem]">
      <span className="font-medium" lang="pt-BR">
        {word.portuguese}
        {!word.builtIn && <span className="ml-2 rounded-full bg-raised px-2 py-0.5 text-xs text-accent">sua</span>}
        {edited && <span className="ml-2 rounded-full bg-raised px-2 py-0.5 text-xs text-warn">editada</span>}
      </span>
      <span className="col-start-1 font-mono md:col-start-auto" lang="en">
        {word.english}
      </span>
      <span className="col-start-1 font-mono text-muted md:col-start-auto" lang="en">
        {word.alternatives.join(', ')}
      </span>
      <span className="col-start-1 text-muted md:col-start-auto">{word.category}</span>
      <span
        className="col-start-1 font-mono text-xs md:col-start-auto"
        title={word.lastSeen === null ? 'Nunca praticada' : `Última vez: ${word.lastSeen}`}
      >
        {seen === 0 ? (
          <span className="text-dim">—</span>
        ) : (
          <>
            <span className="text-ok">{word.timesRight}✓</span> <span className="text-bad">{word.timesWrong}✗</span>
          </>
        )}
      </span>
      <span className="col-start-2 row-span-5 row-start-1 flex items-center justify-end gap-1 md:col-start-auto md:row-span-1 md:row-start-auto">
        {edited && (
          <button type="button" onClick={onRestore} aria-label="Restaurar original" title="Restaurar original" className={ICON_BUTTON}>
            <ArrowCounterClockwise size={16} weight="bold" aria-hidden="true" />
          </button>
        )}
        <button type="button" onClick={onEdit} aria-label={`Editar ${word.portuguese}`} title="Editar" className={ICON_BUTTON}>
          <PencilSimple size={16} weight="bold" aria-hidden="true" />
        </button>
        <button type="button" onClick={onDelete} aria-label={`Apagar ${word.portuguese}`} title="Apagar" className={ICON_BUTTON}>
          <Trash size={16} weight="bold" aria-hidden="true" />
        </button>
      </span>
    </li>
  );
}

function WordForm({
  initial,
  categories,
  submitLabel,
  onSave,
  onCancel,
}: {
  initial?: WordFields;
  categories: string[];
  submitLabel: string;
  onSave: (fields: WordFields) => void;
  onCancel: () => void;
}) {
  const [portuguese, setPortuguese] = useState(initial?.portuguese ?? '');
  const [english, setEnglish] = useState(initial?.english ?? '');
  const [alternatives, setAlternatives] = useState(initial?.alternatives.join(', ') ?? '');
  const [category, setCategory] = useState(initial?.category ?? categories[0] ?? '');

  const fields = cleanFields({ portuguese, english, alternatives: alternatives.split(','), category });
  const complete = isComplete(fields);

  return (
    <form
      className="flex flex-col gap-4 rounded-md border border-line bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (complete) onSave(fields);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Português</span>
          <input value={portuguese} onChange={(event) => setPortuguese(event.target.value)} autoFocus lang="pt-BR" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Inglês</span>
          <input value={english} onChange={(event) => setEnglish(event.target.value)} spellCheck={false} lang="en" className={`${INPUT} font-mono`} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">
            Alternativas <span className="font-normal text-muted">(separadas por vírgula)</span>
          </span>
          <input
            value={alternatives}
            onChange={(event) => setAlternatives(event.target.value)}
            spellCheck={false}
            lang="en"
            placeholder="opcional"
            className={`${INPUT} font-mono`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Categoria</span>
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            list="vocabulary-categories"
            placeholder="escolha ou crie"
            className={INPUT}
          />
          <datalist id="vocabulary-categories">
            {categories.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
      </div>

      <div className="flex gap-2">
        <button type="submit" className={PRIMARY} disabled={!complete}>
          <Check size={16} weight="bold" aria-hidden="true" />
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-10 items-center gap-2 rounded-sm border border-line px-4 text-sm font-medium text-fg hover:border-accent hover:text-accent"
        >
          <X size={16} weight="bold" aria-hidden="true" />
          Cancelar
        </button>
      </div>
    </form>
  );
}
