import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CaptionParseError, parseCaptions, stripInlineTags } from '@/lib/captions/parse-captions';

const fixture = (nome: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${nome}`, import.meta.url)), 'utf8');

describe('parseCaptions — SRT', () => {
  const srt = `1
00:00:01,200 --> 00:00:03,360
All right, so here we are

2
00:00:05,318 --> 00:00:07,974
in front of the elephants
`;

  it('detecta o formato', () => {
    expect(parseCaptions(srt).format).toBe('srt');
  });

  it('lê timestamps com vírgula', () => {
    const { cues } = parseCaptions(srt);
    expect(cues[0]).toEqual({
      id: 'c0',
      startMs: 1200,
      endMs: 3360,
      text: 'All right, so here we are',
    });
  });

  it('junta linhas do mesmo cue num texto só', () => {
    const { cues } = parseCaptions('1\n00:00:00,000 --> 00:00:02,000\nprimeira linha\nsegunda linha\n');
    expect(cues[0].text).toBe('primeira linha segunda linha');
  });

  it('aceita CRLF', () => {
    const { cues } = parseCaptions(srt.replace(/\n/g, '\r\n'));
    expect(cues).toHaveLength(2);
    expect(cues[1].text).toBe('in front of the elephants');
  });

  it('aceita BOM no início', () => {
    expect(parseCaptions(`﻿${srt}`).cues).toHaveLength(2);
  });

  it('aceita arquivo sem quebra de linha no fim', () => {
    expect(parseCaptions(srt.trimEnd()).cues).toHaveLength(2);
  });

  it('aceita blocos separados por várias linhas em branco', () => {
    expect(parseCaptions(srt.replace('\n\n2', '\n\n\n\n2')).cues).toHaveLength(2);
  });

  it('numera os cues em sequência a partir de zero', () => {
    expect(parseCaptions(srt).cues.map((c) => c.id)).toEqual(['c0', 'c1']);
  });
});

describe('parseCaptions — WebVTT', () => {
  it('detecta o formato e pula o cabeçalho', () => {
    const { cues, format } = parseCaptions(fixture('manual.en.vtt'));
    expect(format).toBe('vtt');
    expect(cues).toHaveLength(6);
    expect(cues[0].startMs).toBe(1200);
    expect(cues[0].text).toBe('All right, so here we are, in front of the elephants');
  });

  it('lê timestamps com ponto', () => {
    const { cues } = parseCaptions('WEBVTT\n\n00:00:12.616 --> 00:00:14.367\nand that’s cool\n');
    expect(cues[0]).toMatchObject({ startMs: 12_616, endMs: 14_367 });
  });

  it('aceita timestamp sem a hora (MM:SS.mmm)', () => {
    const { cues } = parseCaptions('WEBVTT\n\n01:30.500 --> 01:32.000\nolá\n');
    expect(cues[0].startMs).toBe(90_500);
  });

  it('ignora as configurações de posição depois do timestamp', () => {
    const { cues } = parseCaptions(
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000 align:start position:0%\ntexto\n',
    );
    expect(cues[0].text).toBe('texto');
  });

  it('ignora blocos NOTE, STYLE e REGION', () => {
    const vtt = `WEBVTT

NOTE
esse comentário não é legenda
e continua aqui

STYLE
::cue { color: yellow }

REGION
id:falante width:40%

00:00:01.000 --> 00:00:02.000
texto de verdade
`;
    const { cues } = parseCaptions(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('texto de verdade');
  });

  it('aceita identificador textual antes do timestamp', () => {
    const { cues } = parseCaptions('WEBVTT\n\nintro\n00:00:01.000 --> 00:00:02.000\ntexto\n');
    expect(cues[0].text).toBe('texto');
  });

  it('descarta cues que só tinham marcação', () => {
    const { cues } = parseCaptions(
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n \n\n00:00:03.000 --> 00:00:04.000\ntexto\n',
    );
    expect(cues).toHaveLength(1);
  });

  it('ordena os cues por tempo de início', () => {
    const { cues } = parseCaptions(
      'WEBVTT\n\n00:00:05.000 --> 00:00:06.000\nsegundo\n\n00:00:01.000 --> 00:00:02.000\nprimeiro\n',
    );
    expect(cues.map((c) => c.text)).toEqual(['primeiro', 'segundo']);
  });

  it('lê a fixture ASR inteira sem engasgar', () => {
    const { cues } = parseCaptions(fixture('asr.en.vtt'));
    expect(cues.length).toBeGreaterThan(5);
    expect(cues.every((c) => !c.text.includes('<'))).toBe(true);
  });
});

describe('stripInlineTags', () => {
  it.each([
    ['<i>All right</i>, so here we are', 'All right, so here we are'],
    ['<c.colorE5E5E5>texto</c>', 'texto'],
    ['<v Roger Bingham>texto', 'texto'],
    ['all<00:00:00.539> right<00:00:00.960> so', 'all right so'],
    ['and that&#39;s cool', "and that's cool"],
    ['a &amp; b', 'a & b'],
    ['&lt;não é tag&gt;', '<não é tag>'],
    ['espaços     demais', 'espaços demais'],
  ])('%s → %s', (entrada, esperado) => {
    expect(stripInlineTags(entrada)).toBe(esperado);
  });

  it('roda no parser: a fixture SRT sai sem tags nem entidades', () => {
    const { cues } = parseCaptions(fixture('manual.srt'));
    expect(cues[0].text).toBe('All right, so here we are, in front of the elephants');
    expect(cues[3].text).toBe("and that's cool");
  });
});

describe('parseCaptions — entrada inválida dá erro legível', () => {
  it('vazio', () => {
    expect(() => parseCaptions('')).toThrow(CaptionParseError);
    expect(() => parseCaptions('   ')).toThrow(/vazia/);
  });

  it('texto que não é legenda', () => {
    expect(() => parseCaptions('só um texto qualquer\nsem timestamp nenhum')).toThrow(
      /timestamp/,
    );
  });

  it('timestamp malformado aponta a linha', () => {
    try {
      parseCaptions('1\n00:00:01 --> 00:00:03\ntexto\n');
      expect.unreachable('deveria ter lançado');
    } catch (erro) {
      expect(erro).toBeInstanceOf(CaptionParseError);
      expect((erro as CaptionParseError).line).toBe(2);
      expect((erro as Error).message).toMatch(/timestamp inválido/);
    }
  });

  it('segundos fora da faixa', () => {
    expect(() => parseCaptions('1\n00:00:99,000 --> 00:00:03,000\ntexto\n')).toThrow(/faixa/);
  });

  it('bloco sem linha de tempo', () => {
    expect(() => parseCaptions('1\ntexto sem tempo\n\n2\n00:00:01,000 --> 00:00:02,000\nok\n')).toThrow(
      CaptionParseError,
    );
  });

  it('VTT só com cabeçalho', () => {
    expect(() => parseCaptions('WEBVTT\nKind: captions\n')).toThrow(/nenhuma legenda/);
  });

  it('nunca estoura com TypeError em entrada não-string', () => {
    // @ts-expect-error — entrada vinda da UI pode ser qualquer coisa.
    expect(() => parseCaptions(null)).toThrow(CaptionParseError);
  });
});

describe('parseCaptions — armadilha do ASR do YouTube', () => {
  it('linha só com espaço dentro do cue não encerra o bloco', () => {
    const vtt = `WEBVTT

00:00:00.030 --> 00:00:02.909 align:start position:0%
 
all<00:00:00.539> right<00:00:00.960> so
`;
    const { cues } = parseCaptions(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('all right so');
  });

  it('mas whitespace seguido de um novo cue encerra', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
primeiro
   
00:00:03.000 --> 00:00:04.000
segundo
`;
    expect(parseCaptions(vtt).cues.map((c) => c.text)).toEqual(['primeiro', 'segundo']);
  });
});
