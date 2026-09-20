import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCaptions } from '@/lib/captions/parse-captions';
import { contarPalavras, segment, stripNonSpeech } from '@/lib/segmenter';
import type { Cue } from '@/types';

const fixture = (nome: string) =>
  parseCaptions(readFileSync(fileURLToPath(new URL(`./fixtures/${nome}`, import.meta.url)), 'utf8'))
    .cues;

/** Açúcar para montar cues nos testes: `cue(0, 2, 'texto')` em segundos. */
const cue = (startSec: number, endSec: number, text: string, id = ''): Cue => ({
  id: id || `c${startSec}`,
  startMs: startSec * 1000,
  endMs: endSec * 1000,
  text,
});

describe('stripNonSpeech', () => {
  it.each([
    ['[Music]', ''],
    ['[Applause]', ''],
    ['[ __ ] you', 'you'],
    ['(baaaaaaaaaaahhh!!)', ''],
    ['♪ la la la ♪', 'la la la'],
    ['>> and then he said', 'and then he said'],
    ['>>> JOHN: and then he said', 'and then he said'],
    ['NARRATOR: once upon a time', 'once upon a time'],
    ['DR. SMITH: hello', 'hello'],
    ['Well: that is different', 'Well: that is different'],
    ['texto normal', 'texto normal'],
  ])('%s → %s', (entrada, esperado) => {
    expect(stripNonSpeech(entrada)).toBe(esperado);
  });
});

describe('segment — regras de agrupamento', () => {
  it('junta cues curtos até alcançar o alvo mínimo', () => {
    const s = segment([
      cue(0, 1, 'the cool thing'),
      cue(1, 2, 'about these guys'),
      cue(2, 3.5, 'is that they have really long trunks'),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].referenceText).toBe('the cool thing about these guys is that they have really long trunks');
    expect(s[0].startMs).toBe(0);
    expect(s[0].endMs).toBe(3500);
  });

  it('quebra na pontuação final assim que passa do alvo mínimo', () => {
    const s = segment([
      cue(0, 3.2, 'All right, so here we are.'),
      cue(3.2, 6.4, 'In front of the elephants.'),
    ]);
    expect(s.map((x) => x.referenceText)).toEqual([
      'All right, so here we are.',
      'In front of the elephants.',
    ]);
  });

  it('abaixo do alvo mínimo, a pontuação final não basta para quebrar', () => {
    const s = segment([
      cue(0, 2, 'All right, so here we are.'),
      cue(2, 4, 'In front of the elephants.'),
    ]);
    expect(s.map((x) => x.referenceText)).toEqual([
      'All right, so here we are. In front of the elephants.',
    ]);
  });

  it('quebra num silêncio ≥ 700ms quando não há pontuação', () => {
    const s = segment([
      cue(0, 3.2, 'all right so here we are'),
      cue(4.5, 7, 'in front of the elephants'),
    ]);
    expect(s).toHaveLength(2);
  });

  it('não quebra num silêncio curto', () => {
    const s = segment([
      cue(0, 3.2, 'all right so here we are'),
      cue(3.4, 5.5, 'in front of the elephants'),
    ]);
    expect(s).toHaveLength(1);
  });

  it('nunca quebra no meio de um cue', () => {
    const s = segment([cue(0, 4, 'uma frase. outra frase no mesmo cue.')]);
    expect(s).toHaveLength(1);
    expect(s[0].sourceCueIds).toHaveLength(1);
  });

  it('respeita o teto de palavras', () => {
    const cues = Array.from({ length: 8 }, (_, i) =>
      cue(i * 0.5, (i + 1) * 0.5, 'uma duas três', `c${i}`),
    );
    const s = segment(cues);
    expect(s.every((x) => contarPalavras(x.referenceText) <= 15)).toBe(true);
  });

  it('respeita o teto de duração', () => {
    const cues = Array.from({ length: 6 }, (_, i) => cue(i * 2.5, (i + 1) * 2.5, `frase ${i}`, `c${i}`));
    const s = segment(cues);
    expect(s.every((x) => x.endMs - x.startMs <= 8000)).toBe(true);
  });

  it('cue grande demais sozinho passa inteiro — a spec proíbe quebrar no meio', () => {
    const grande = cue(0, 20, Array.from({ length: 40 }, (_, i) => `p${i}`).join(' '));
    const s = segment([grande]);
    expect(s).toHaveLength(1);
    expect(contarPalavras(s[0].referenceText)).toBe(40);
  });

  it('indexa os segmentos em sequência a partir de zero', () => {
    const cues = Array.from({ length: 10 }, (_, i) =>
      cue(i * 3, i * 3 + 2.9, `frase número ${i} com algumas palavras.`, `c${i}`),
    );
    expect(segment(cues).map((x) => x.index)).toEqual([...Array(segment(cues).length).keys()]);
  });

  it('guarda a origem de cada segmento', () => {
    const s = segment([cue(0, 1.5, 'primeira parte', 'a'), cue(1.5, 3.2, 'segunda parte aqui', 'b')]);
    expect(s[0].sourceCueIds).toEqual(['a', 'b']);
  });

  it('legenda vazia devolve lista vazia', () => {
    expect(segment([])).toEqual([]);
    expect(segment([cue(0, 2, '[Music]')])).toEqual([]);
  });

  it('a sobra curta do fim volta para o segmento anterior', () => {
    const s = segment([
      cue(0, 3.5, 'uma frase razoavelmente longa aqui.'),
      cue(3.5, 3.9, 'sobra'),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].referenceText).toMatch(/sobra$/);
    expect(s[0].endMs).toBe(3900);
  });

  it('aceita opções customizadas', () => {
    const cues = [cue(0, 2, 'uma duas três'), cue(2, 4, 'quatro cinco seis')];
    expect(segment(cues, { maxWords: 3 })).toHaveLength(2);
  });
});

describe('segment — dedupe do rolling text do ASR', () => {
  it('descarta o cue-fantasma que só repete o anterior', () => {
    const s = segment([
      cue(0, 2.9, 'all right so here we are'),
      cue(2.909, 2.919, 'all right so here we are'),
      cue(2.919, 5.66, 'all right so here we are in front of the elephants'),
    ]);
    expect(s.map((x) => x.referenceText)).toEqual([
      'all right so here we are in front of the elephants',
    ]);
  });

  it('não corta repetição curta de fala real', () => {
    const s = segment([
      cue(0, 2.9, 'is that they have really...'),
      cue(2.9, 5.5, 'really really long trunks'),
    ]);
    expect(s[0].referenceText).toBe('is that they have really... really really long trunks');
  });
});

describe('segment — fixtures reais', () => {
  it.each(['manual.en.vtt', 'manual.srt', 'asr.en.vtt'])('%s satisfaz os limites', (nome) => {
    const segmentos = segment(fixture(nome));

    expect(segmentos.length).toBeGreaterThan(0);
    for (const s of segmentos) {
      expect(contarPalavras(s.referenceText), `palavras em "${s.referenceText}"`).toBeLessThanOrEqual(15);
      expect(s.endMs - s.startMs, `duração de "${s.referenceText}"`).toBeGreaterThanOrEqual(1500);
      expect(s.referenceText).not.toMatch(/\[|\]|♪|>>/);
      expect(s.endMs).toBeGreaterThan(s.startMs);
    }

    // Sem buracos nem sobreposição: os segmentos avançam no tempo.
    for (let i = 1; i < segmentos.length; i++) {
      expect(segmentos[i].startMs).toBeGreaterThanOrEqual(segmentos[i - 1].endMs);
    }
  });

  it('o rolling text do ASR não aparece duplicado', () => {
    const texto = segment(fixture('asr.en.vtt'))
      .map((s) => s.referenceText)
      .join(' ');
    const ocorrencias = (texto.match(/in front of the elephants/g) ?? []).length;
    expect(ocorrencias).toBe(1);
    expect((texto.match(/all right so here we are/g) ?? []).length).toBe(1);
  });

  it('[Music] sumiu do ASR', () => {
    expect(segment(fixture('asr.en.vtt')).some((s) => /music/i.test(s.referenceText))).toBe(false);
  });
});
