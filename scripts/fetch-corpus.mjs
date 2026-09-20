/**
 * Baixa o corpus de legendas reais que o `segmenter-corpus.test.ts` usa.
 *
 * Os arquivos não vivem no git — são legenda de vídeo de terceiro, e o repo é
 * público. Este script os traz de volta a partir dos videoIds, que são a única
 * coisa que precisa ser versionada.
 *
 *   npm run corpus
 *
 * Precisa do yt-dlp (veja o README). Uma faixa `en` por vídeo, exatamente como
 * a rota do app faz — pedir mais de uma em sequência toma 429.
 */

import { execFile } from 'node:child_process';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const DESTINO = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'corpus');
const BINARIO = process.env.YT_DLP_PATH ?? 'yt-dlp';

/** Os cinco tipos do Passo 0 do plano. Ver docs/videos-for-test.md. */
const CORPUS = [
  ['01-manual-mkbhd', 'ohqxP8EEumo'],
  ['02-asr-sandeep', '45oG6w7bvtM'],
  ['03-asr-long-melrobbins', '8dHEG7WxR4c'],
  ['04-asr-small-channel', 'xxdlUHSWM7E'],
  ['05-asr-restricted-guess', 'Fy291Q3a6zs'],
];

async function existe(caminho) {
  try {
    await stat(caminho);
    return true;
  } catch {
    return false;
  }
}

async function baixar(nome, videoId) {
  const alvo = join(DESTINO, `${nome}.en.vtt`);
  if (await existe(alvo)) {
    console.log(`· ${nome}: já está aqui`);
    return;
  }

  const temporario = join(DESTINO, `.tmp-${videoId}`);
  await mkdir(temporario, { recursive: true });

  try {
    await run(
      BINARIO,
      [
        '--js-runtimes',
        'node',
        '--skip-download',
        '--write-sub',
        '--write-auto-sub',
        '--sub-lang',
        'en',
        '--sub-format',
        'vtt',
        '--no-playlist',
        '--no-warnings',
        '--no-progress',
        '-o',
        join(temporario, '%(id)s.%(ext)s'),
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      { timeout: 120_000 },
    );

    const [arquivo] = (await readdir(temporario)).filter((f) => f.endsWith('.vtt'));
    if (arquivo === undefined) throw new Error('o yt-dlp não escreveu nenhum .vtt');

    await rename(join(temporario, arquivo), alvo);
    console.log(`✓ ${nome}`);
  } finally {
    await rm(temporario, { recursive: true, force: true });
  }
}

await mkdir(DESTINO, { recursive: true });

for (const [nome, videoId] of CORPUS) {
  try {
    await baixar(nome, videoId);
  } catch (erro) {
    console.error(`✗ ${nome} (${videoId}): ${erro.message.split('\n')[0]}`);
    process.exitCode = 1;
  }
}
