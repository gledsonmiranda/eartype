import { Innertube, Log } from 'youtubei.js';
Log.setLevel(Log.Level.ERROR);
const id = process.argv[2];
const yt = await Innertube.create({ lang: 'en', location: 'US', retrieve_player: true });
const info = await yt.getInfo(id);
const track = (info.captions?.caption_tracks ?? []).find(t => t.language_code?.startsWith('en'));
if (!track) { console.log('sem faixa en'); process.exit(0); }
console.log('base_url host:', new URL(track.base_url).host, '| kind:', track.kind ?? 'manual');
for (const fmt of ['json3', 'srv3', '']) {
  const url = track.base_url + (fmt ? `&fmt=${fmt}` : '');
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en' } });
    const body = await r.text();
    console.log(`fmt=${fmt || '(default)'} status=${r.status} bytes=${body.length} inicio=${JSON.stringify(body.slice(0,80))}`);
  } catch (e) { console.log(`fmt=${fmt} ERRO ${e.message.slice(0,80)}`); }
}
