// SPIKE S-1 — a legenda vem mesmo?
// Uso: node s1-captions.mjs <videoIdOuUrl> [mais ids...]
// Descartável. Objetivo: descobrir se youtubei.js devolve legenda em inglês
// de forma confiável para vídeos reais, e quanto tempo leva.

import { Innertube, Log } from 'youtubei.js';
Log.setLevel(Log.Level.ERROR);

function parseId(input) {
  if (/^[\w-]{11}$/.test(input)) return input;
  const m =
    input.match(/[?&]v=([\w-]{11})/) ||
    input.match(/youtu\.be\/([\w-]{11})/) ||
    input.match(/\/(?:embed|shorts|live)\/([\w-]{11})/);
  return m ? m[1] : null;
}

const cut = (s, n = 70) => (s.length > n ? s.slice(0, n) + '…' : s);
const secs = (ms) => (ms / 1000).toFixed(1) + 's';

async function probe(yt, raw) {
  const id = parseId(raw);
  console.log('\n' + '─'.repeat(72));
  if (!id) return console.log(`✗ não consegui extrair videoId de: ${raw}`);

  const t0 = Date.now();
  let info;
  try {
    info = await yt.getInfo(id);
  } catch (e) {
    return console.log(`${id}\n✗ getInfo falhou: ${e.message}`);
  }

  const b = info.basic_info ?? {};
  console.log(`${id} — ${cut(b.title ?? '(sem título)', 60)}`);
  console.log(
    `  duração: ${b.duration ? Math.round(b.duration / 60) + 'min' : '?'}` +
      ` · live: ${b.is_live ? 'SIM' : 'não'}` +
      ` · playable: ${info.playability_status?.status ?? '?'}`,
  );

  const tracks = info.captions?.caption_tracks ?? [];
  if (!tracks.length) console.log('  faixas: NENHUMA');
  else
    console.log(
      '  faixas: ' +
        tracks
          .map((t) => `${t.language_code}${t.kind === 'asr' ? '(asr)' : '(manual)'}`)
          .join(', '),
    );

  // embeddable é o que decide se o player da nossa app consegue tocar
  const emb = info.basic_info?.is_embeddable;
  if (emb === false) console.log('  ⚠ is_embeddable: false — o player do app não vai tocar');

  let transcript;
  try {
    transcript = await info.getTranscript();
  } catch (e) {
    return console.log(`  ✗ getTranscript falhou: ${e.message}  [${Date.now() - t0}ms]`);
  }

  const segments =
    transcript?.transcript?.content?.body?.initial_segments?.filter((s) => s.snippet) ?? [];
  if (!segments.length) return console.log(`  ✗ transcript vazio  [${Date.now() - t0}ms]`);

  const first = segments[0];
  const last = segments[segments.length - 1];
  const durations = segments.map((s) => Number(s.end_ms) - Number(s.start_ms));
  const words = segments.map((s) => s.snippet.text.trim().split(/\s+/).length);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

  // sinais de legenda auto-gerada: sem pontuação final, tudo minúsculo
  const sample = segments.slice(0, 40).map((s) => s.snippet.text).join(' ');
  const hasPunct = /[.?!]/.test(sample);
  const hasCaps = /[A-Z]/.test(sample.slice(1));

  console.log(`  ✓ ${segments.length} cues  [${Date.now() - t0}ms]`);
  console.log(
    `    cue: min ${secs(Math.min(...durations))} / méd ${secs(avg(durations))} / max ${secs(Math.max(...durations))}` +
      ` · palavras/cue méd ${avg(words).toFixed(1)}`,
  );
  console.log(`    cobre ${secs(Number(first.start_ms))} → ${secs(Number(last.end_ms))}`);
  console.log(`    pontuação: ${hasPunct ? 'sim' : 'NÃO'} · maiúsculas: ${hasCaps ? 'sim' : 'NÃO'}`);
  console.log('    primeiros cues:');
  for (const s of segments.slice(0, 3)) {
    console.log(`      [${secs(Number(s.start_ms))}] ${cut(s.snippet.text, 60)}`);
  }
}

const args = process.argv.slice(2);
if (!args.length) {
  console.log('uso: node s1-captions.mjs <videoIdOuUrl> [...]');
  process.exit(1);
}

const yt = await Innertube.create({ lang: 'en', location: 'US', retrieve_player: true });
for (const a of args) await probe(yt, a);
console.log('\n' + '─'.repeat(72));
