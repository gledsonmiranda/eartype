/**
 * Contratos centrais do domínio (PLAN.md §Contratos).
 *
 * Regra: `segmenter`, `normalize` e `diff` não conhecem React, YouTube ou DOM.
 * Recebem dados, devolvem dados.
 */

/** Uma linha de legenda, como veio da fonte (yt-dlp, SRT/VTT colado). */
export type Cue = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
};

/** Um trecho praticável: o que o player toca e o que você tem que digitar. */
export type Segment = {
  index: number;
  startMs: number;
  endMs: number;
  referenceText: string;
  /** Cues que deram origem ao segmento — só para diagnóstico. */
  sourceCueIds: string[];
};

export type TokenStatus = 'correct' | 'typo' | 'wrong' | 'missing' | 'extra';

export type DiffToken = {
  /** O que aparece na tela para este token. */
  text: string;
  status: TokenStatus;
  /** Preenchido quando `status` é 'typo' ou 'wrong': a palavra da referência. */
  expected?: string;
};

export type DiffResult = {
  tokens: DiffToken[];
  /** 0..1 — tokens corretos (typo vale 0,5) sobre tokens da referência. */
  accuracy: number;
};

export type CorrectionMode = 'lenient' | 'strict';

export type CaptionFormat = 'srt' | 'vtt';

export type CaptionKind = 'manual' | 'asr';
