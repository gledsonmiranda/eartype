// Prova: o Next.js (Node) consegue legenda chamando o yt-dlp como processo?
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
const PY = './.venv/Scripts/python.exe';

async function getCaptions(videoId) {
  const dir = await mkdtemp(join(tmpdir(), 'cap-'));
  const t0 = Date.now();
  try {
    await run(PY, ['-m', 'yt_dlp', '--skip-download', '--write-sub', '--write-auto-sub',
      '--sub-lang', 'en', '--sub-format', 'vtt', '--no-warnings',
      '-o', join(dir, '%(id)s.%(ext)s'), `https://www.youtube.com/watch?v=${videoId}`],
      { timeout: 60000 });
    const files = (await readdir(dir)).filter(f => f.endsWith('.vtt'));
    if (!files.length) throw new Error('nenhum .vtt gerado');
    const raw = await readFile(join(dir, files[0]), 'utf8');
    return { file: files[0], bytes: raw.length, cues: (raw.match(/ --> /g) || []).length, ms: Date.now() - t0 };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

console.log(JSON.stringify(await getCaptions(process.argv[2]), null, 2));
