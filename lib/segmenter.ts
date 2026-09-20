/**
 * RF-03 — transforma cues irregulares em segmentos praticáveis.
 *
 * A legenda crua vem em pedaços de tamanho arbitrário (às vezes uma palavra
 * solta, às vezes uma frase inteira). O segmentador reagrupa isso em trechos
 * de 3–8s e até ~15 palavras, quebrando de preferência onde a fala pausa.
 *
 * Sem React, sem DOM, sem rede: entra `Cue[]`, sai `Segment[]`.
 */

import type { Cue, Segment } from '@/types';

export type SegmentOptions = {
  /** Abaixo disso o segmento é curto demais para praticar. */
  minMs?: number;
  /** Alvo mínimo: só a partir daqui vale a pena procurar um ponto de quebra. */
  targetMinMs?: number;
  /** Teto duro de duração. */
  maxMs?: number;
  /** Teto duro de palavras. */
  maxWords?: number;
  /** Silêncio entre cues que conta como pausa natural. */
  silenceGapMs?: number;
  /** Remove `[Music]`, `>>`, `NAME:` etc. */
  stripNonSpeech?: boolean;
};

const PADRAO: Required<SegmentOptions> = {
  minMs: 1500,
  targetMinMs: 3000,
  maxMs: 8000,
  maxWords: 15,
  silenceGapMs: 700,
  stripNonSpeech: true,
};

// ---------------------------------------------------------------- limpeza

/** `[Music]`, `[Applause]`, `[Laughter]`, `[ __ ]`… — convenção do YouTube. */
const COLCHETES = /\[[^\]]*\]/g;
/** Um cue inteiro entre parênteses é anotação de som: `(baaaah!!)`. */
const SO_PARENTESES = /^\([^)]*\)$/;
/** Marcador de troca de falante. */
const SETAS = /^>>+\s*/;
/** Rótulo de falante em caixa alta: `JOHN:`, `NARRATOR:`, `DR. SMITH:`. */
const ROTULO_DE_FALANTE = /^[A-Z][A-Z0-9 .'’-]{1,24}:\s*/;
/** Linhas de música: ♪ … ♪ */
const NOTAS_MUSICAIS = /[♪♫]/g;

export function stripNonSpeech(text: string): string {
  let t = text.replace(COLCHETES, ' ');
  if (NOTAS_MUSICAIS.test(t)) t = t.replace(NOTAS_MUSICAIS, ' ');
  t = t.replace(SETAS, '');
  t = t.replace(ROTULO_DE_FALANTE, '');
  t = t.trim();
  if (SO_PARENTESES.test(t)) return '';
  return t.replace(/\s+/g, ' ').trim();
}

/** Forma comparável de uma palavra — só para detectar repetição, não para o diff. */
function chave(palavra: string): string {
  return palavra.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
}

function palavras(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

export function contarPalavras(text: string): number {
  return palavras(text).length;
}

/**
 * Remove o *rolling text* da legenda auto-gerada: o YouTube repete a linha
 * anterior no começo do cue seguinte.
 *
 * O corte exige uma sobreposição de pelo menos 3 palavras, porque repetição
 * curta é fala de verdade — "have really… really really long trunks" precisa
 * continuar inteira.
 */
const MIN_SOBREPOSICAO = 3;

function removerRepeticao(anterior: string, atual: string): string {
  const a = palavras(anterior).map(chave);
  const b = palavras(atual);
  const bChaves = b.map(chave);
  const maximo = Math.min(a.length, b.length);

  for (let k = maximo; k >= 1; k--) {
    const casa = a.slice(a.length - k).every((p, idx) => p === bChaves[idx]);
    if (!casa) continue;
    // O cue inteiro já apareceu: é o cue-fantasma de 10ms do ASR.
    if (k === b.length) return '';
    if (k >= MIN_SOBREPOSICAO) return b.slice(k).join(' ');
    return atual;
  }
  return atual;
}

export function limparCues(cues: Cue[], opts: Required<SegmentOptions>): Cue[] {
  const saida: Cue[] = [];

  for (const cue of cues) {
    const texto = opts.stripNonSpeech ? stripNonSpeech(cue.text) : cue.text.trim();
    if (texto === '') continue;

    const anterior = saida[saida.length - 1];
    const semRepeticao = anterior ? removerRepeticao(anterior.text, texto) : texto;
    if (semRepeticao === '') continue;

    // O cue-fantasma do ASR encurtou o texto: o tempo real da fala nova começa
    // onde o cue começa, mas o fim do anterior não deve passar por cima dele.
    saida.push({ ...cue, text: semRepeticao });
  }

  return saida;
}

// ------------------------------------------------------------ segmentação

const PONTUACAO_FINAL = /[.!?]["'”’)\]]*$/;
const PONTUACAO_FRACA = /[,;:—–-]["'”’)\]]*$/;

type EmConstrucao = { cues: Cue[]; startMs: number; endMs: number; texto: string };

function fechar(atual: EmConstrucao, index: number): Segment {
  return {
    index,
    startMs: atual.startMs,
    endMs: atual.endMs,
    referenceText: atual.texto,
    sourceCueIds: atual.cues.map((c) => c.id),
  };
}

export function segment(cues: Cue[], opts: SegmentOptions = {}): Segment[] {
  const o = { ...PADRAO, ...opts };
  const limpos = limparCues(cues, o);
  if (limpos.length === 0) return [];

  const segmentos: Segment[] = [];
  let atual: EmConstrucao | null = null;

  const emitir = () => {
    if (!atual) return;
    segmentos.push(fechar(atual, segmentos.length));
    atual = null;
  };

  for (let i = 0; i < limpos.length; i++) {
    const cue = limpos[i];
    const proximo = limpos[i + 1];

    if (atual === null) {
      atual = { cues: [cue], startMs: cue.startMs, endMs: cue.endMs, texto: cue.text };
    } else {
      const duracaoCandidata = cue.endMs - atual.startMs;
      const palavrasCandidatas = contarPalavras(`${atual.texto} ${cue.text}`);
      const estouraria = palavrasCandidatas > o.maxWords || duracaoCandidata > o.maxMs;

      if (estouraria) {
        emitir();
        atual = { cues: [cue], startMs: cue.startMs, endMs: cue.endMs, texto: cue.text };
      } else {
        atual = {
          cues: [...atual.cues, cue],
          startMs: atual.startMs,
          endMs: cue.endMs,
          texto: `${atual.texto} ${cue.text}`,
        };
      }
    }

    const duracao = atual.endMs - atual.startMs;
    const totalPalavras = contarPalavras(atual.texto);
    const gap = proximo ? proximo.startMs - atual.endMs : Infinity;

    // Tetos duros primeiro: acima deles não há escolha.
    if (totalPalavras >= o.maxWords || duracao >= o.maxMs) {
      emitir();
      continue;
    }

    if (duracao < o.targetMinMs) continue;

    // Dentro do alvo: procura o melhor lugar para quebrar, na ordem da spec.
    if (PONTUACAO_FINAL.test(atual.texto)) {
      emitir();
    } else if (gap >= o.silenceGapMs) {
      emitir();
    } else if (PONTUACAO_FRACA.test(atual.texto) && duracao >= (o.targetMinMs + o.maxMs) / 2) {
      emitir();
    }
  }

  emitir();
  return juntarSobra(segmentos, o);
}

/**
 * O último segmento costuma sobrar curto (o que restou da legenda). Trecho de
 * meio segundo não dá para praticar: volta para o anterior, mesmo que o
 * resultado fique um pouco acima do alvo de palavras.
 */
function juntarSobra(segmentos: Segment[], o: Required<SegmentOptions>): Segment[] {
  if (segmentos.length < 2) return segmentos;

  const ultimo = segmentos[segmentos.length - 1];
  if (ultimo.endMs - ultimo.startMs >= o.minMs) return segmentos;

  const anterior = segmentos[segmentos.length - 2];
  const juntos = `${anterior.referenceText} ${ultimo.referenceText}`;
  if (contarPalavras(juntos) > o.maxWords + 5) return segmentos;

  const fundido: Segment = {
    index: anterior.index,
    startMs: anterior.startMs,
    endMs: ultimo.endMs,
    referenceText: juntos,
    sourceCueIds: [...anterior.sourceCueIds, ...ultimo.sourceCueIds],
  };

  return [...segmentos.slice(0, -2), fundido];
}
