/**
 * RF-02b — parser de SRT e WebVTT, com detecção automática de formato.
 *
 * Aceita o que se encontra na prática: CRLF, BOM, `,` ou `.` no separador de
 * milissegundos, blocos `NOTE`/`STYLE`/`REGION`, tags inline (`<i>`, `<c.x>`,
 * `<00:00:01.000>`) e as configurações de posição do WebVTT depois do timestamp.
 *
 * Não conhece rede nem DOM: entra texto, sai `Cue[]`.
 */

import type { CaptionFormat, Cue } from '@/types';

export class CaptionParseError extends Error {
  /** 1-based, quando dá para apontar a linha; `undefined` se o problema é o arquivo todo. */
  readonly line?: number;

  constructor(message: string, line?: number) {
    super(line === undefined ? message : `Linha ${line}: ${message}`);
    this.name = 'CaptionParseError';
    this.line = line;
  }
}

export type ParsedCaptions = {
  cues: Cue[];
  format: CaptionFormat;
};

/** `HH:MM:SS,mmm` (SRT) ou `HH:MM:SS.mmm` / `MM:SS.mmm` (VTT). */
const TIMESTAMP = /^(?:(\d+):)?(\d{1,3}):(\d{1,2})[.,](\d{1,3})$/;

const LINHA_DE_TEMPO = /^(\S+)\s*-->\s*(\S+)(?:\s+(.*))?$/;

function parseTimestamp(raw: string, linha: number): number {
  const m = TIMESTAMP.exec(raw.trim());
  if (!m) throw new CaptionParseError(`timestamp inválido: "${raw}"`, linha);

  const [, h, mm, ss, ms] = m;
  const segundos = Number(ss);
  const minutos = Number(mm);
  if (segundos > 59) throw new CaptionParseError(`segundos fora da faixa: "${raw}"`, linha);
  // Em `MM:SS.mmm` (sem hora) os minutos podem passar de 59; em `HH:MM:SS` não.
  if (h !== undefined && minutos > 59) {
    throw new CaptionParseError(`minutos fora da faixa: "${raw}"`, linha);
  }

  return (
    Number(h ?? 0) * 3_600_000 +
    minutos * 60_000 +
    segundos * 1000 +
    Number(ms.padEnd(3, '0'))
  );
}

/** Remove o que é marcação e não texto falado. */
export function stripInlineTags(text: string): string {
  return text
    // Timestamps inline do karaokê do ASR: <00:00:01.000>
    .replace(/<\d{1,3}:\d{2}:\d{2}[.,]\d{1,3}>/g, '')
    // Tags de estilo/voz: <i>, </i>, <c.colorE5E5E5>, <v Speaker>
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    // Entidades que o WebVTT escapa.
    .replace(/&lrm;|&rlm;/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function detectarFormato(texto: string): CaptionFormat {
  return /^﻿?WEBVTT/.test(texto) ? 'vtt' : 'srt';
}

/**
 * Um bloco do WebVTT cujo primeiro token é `NOTE`, `STYLE` ou `REGION` não é
 * um cue — é metadado, e tudo nele deve ser ignorado.
 */
const BLOCOS_IGNORADOS = /^(NOTE|STYLE|REGION)\b/;

/** O bloco começa com a linha de tempo, ou com um índice numérico antes dela. */
function iniciaBloco(linhas: string[], i: number): boolean {
  const linha = linhas[i];
  if (linha === undefined) return false;
  if (linha.includes('-->')) return true;
  return /^\d+$/.test(linha.trim()) && (linhas[i + 1]?.includes('-->') ?? false);
}

/**
 * Separador de blocos. A legenda auto-gerada do YouTube põe uma linha contendo
 * só um espaço *dentro* do cue (o lugar do rolling text), então whitespace
 * sozinho só encerra o bloco quando o que vem depois é de fato um novo cue.
 */
function ehSeparador(linhas: string[], i: number): boolean {
  const linha = linhas[i];
  if (linha === undefined) return true;
  if (linha === '') return true;
  return linha.trim() === '' && iniciaBloco(linhas, i + 1);
}

export function parseCaptions(raw: string): ParsedCaptions {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new CaptionParseError('a legenda está vazia — cole o conteúdo de um arquivo .srt ou .vtt');
  }

  const texto = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const format = detectarFormato(texto);
  const linhas = texto.split('\n');

  const cues: Cue[] = [];
  let i = 0;
  // O cabeçalho do VTT (`WEBVTT ...` + metadados) vai até a primeira linha em branco.
  if (format === 'vtt') {
    while (i < linhas.length && !ehSeparador(linhas, i)) i++;
  }

  while (i < linhas.length) {
    // Pula linhas em branco entre blocos.
    if (linhas[i].trim() === '') {
      i++;
      continue;
    }

    const inicioDoBloco = i;

    if (format === 'vtt' && BLOCOS_IGNORADOS.test(linhas[i].trim())) {
      while (i < linhas.length && !ehSeparador(linhas, i)) i++;
      continue;
    }

    // Índice numérico opcional (obrigatório no SRT, raro no VTT).
    if (/^\d+$/.test(linhas[i].trim()) && linhas[i + 1] !== undefined) {
      i++;
    } else if (
      format === 'vtt' &&
      !linhas[i].includes('-->') &&
      linhas[i + 1]?.includes('-->')
    ) {
      // Identificador textual do cue no VTT.
      i++;
    }

    const linhaDeTempo = linhas[i];
    if (linhaDeTempo === undefined || !linhaDeTempo.includes('-->')) {
      throw new CaptionParseError(
        `esperava um timestamp (00:00:00${format === 'srt' ? ',' : '.'}000 --> ...), encontrei "${(linhas[inicioDoBloco] ?? '').trim()}"`,
        inicioDoBloco + 1,
      );
    }

    const m = LINHA_DE_TEMPO.exec(linhaDeTempo.trim());
    if (!m) {
      throw new CaptionParseError(`linha de tempo malformada: "${linhaDeTempo.trim()}"`, i + 1);
    }

    const startMs = parseTimestamp(m[1], i + 1);
    const endMs = parseTimestamp(m[2], i + 1);
    i++;

    const corpo: string[] = [];
    while (i < linhas.length && !ehSeparador(linhas, i)) {
      corpo.push(linhas[i]);
      i++;
    }

    const text = stripInlineTags(corpo.join('\n')).replace(/\n+/g, ' ').trim();
    if (text === '') continue; // cue vazio: posicionamento ou artefato; não é erro.

    cues.push({
      id: `c${cues.length}`,
      startMs,
      endMs: Math.max(endMs, startMs),
      text,
    });
  }

  if (cues.length === 0) {
    throw new CaptionParseError(
      'não encontrei nenhuma legenda com timestamp — confira se colou o arquivo inteiro',
    );
  }

  cues.sort((a, b) => a.startMs - b.startMs);
  return { cues: cues.map((c, index) => ({ ...c, id: `c${index}` })), format };
}
