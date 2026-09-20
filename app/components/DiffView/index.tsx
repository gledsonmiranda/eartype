/**
 * RF-05 — what you typed, aligned against the reference, word by word.
 *
 * Colour is never the only signal (§8): every status also carries a shape —
 * an underline, a strike, a dashed slot — so the feedback survives a
 * colour-blind reader and a bad monitor alike.
 */

import type { DiffResult, DiffToken, TokenStatus } from '@/types';

const STYLES: Record<TokenStatus, string> = {
  correct: 'text-emerald-300',
  typo: 'text-amber-300 underline decoration-dotted decoration-2 underline-offset-4',
  wrong: 'text-red-300 line-through decoration-2',
  missing: 'text-zinc-400 border border-dashed border-zinc-500 rounded px-1',
  extra: 'text-zinc-500 line-through decoration-2',
};

/** Read out by screen readers, and shown on hover. */
const LABELS: Record<TokenStatus, string> = {
  correct: 'certo',
  typo: 'erro de digitação',
  wrong: 'palavra errada',
  missing: 'faltou',
  extra: 'sobrou',
};

function Token({ token, showCorrection }: { token: DiffToken; showCorrection: boolean }) {
  const correction =
    showCorrection && (token.status === 'typo' || token.status === 'wrong') && token.expected !== undefined
      ? token.expected
      : null;

  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={STYLES[token.status]} title={LABELS[token.status]}>
        {token.text}
      </span>
      {correction !== null && (
        <span className="text-emerald-300" title="o certo era">
          →&nbsp;{correction}
        </span>
      )}
      <span className="sr-only">({LABELS[token.status]})</span>
    </span>
  );
}

export function DiffView({
  result,
  tokens,
  showCorrections = true,
  ariaLabel = 'correção da sua resposta',
}: {
  result?: DiffResult;
  tokens?: DiffToken[];
  showCorrections?: boolean;
  ariaLabel?: string;
}) {
  const items = tokens ?? result?.tokens ?? [];

  return (
    <p
      className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-lg leading-relaxed"
      aria-label={ariaLabel}
    >
      {items.map((token, index) => (
        <Token key={`${index}-${token.text}`} token={token} showCorrection={showCorrections} />
      ))}
    </p>
  );
}

export function AccuracyBadge({ accuracy }: { accuracy: number }) {
  const percent = Math.round(accuracy * 100);
  const tone =
    percent === 100 ? 'text-emerald-300' : percent >= 70 ? 'text-amber-300' : 'text-red-300';

  return <span className={`font-mono text-sm ${tone}`}>{percent}%</span>;
}
