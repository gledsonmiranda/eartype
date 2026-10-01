/**
 * RF-05 — what you typed, aligned against the reference, word by word.
 *
 * Colour is never the only signal (§8): every status also carries a shape —
 * an underline, a strike, a dashed slot — so the feedback survives a
 * colour-blind reader and a bad monitor alike.
 */

import type { DiffResult, DiffToken, TokenStatus } from '@/types';

const STYLES: Record<TokenStatus, string> = {
  correct: 'text-ok',
  typo: 'text-warn underline decoration-dotted decoration-2 underline-offset-4',
  wrong: 'text-bad line-through decoration-2',
  missing: 'text-muted border border-dashed border-line-strong rounded-sm px-1',
  extra: 'text-dim line-through decoration-2',
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
        <span className="text-ok" title="o certo era">
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
      className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-2xl leading-[1.7]"
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
    percent === 100 ? 'bg-ok/10 text-ok' : percent >= 70 ? 'bg-warn/10 text-warn' : 'bg-bad/10 text-bad';

  return <span className={`rounded-sm px-3 py-1.5 font-mono text-sm font-semibold ${tone}`}>{percent}%</span>;
}
