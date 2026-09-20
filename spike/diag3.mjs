import { Innertube, Log } from 'youtubei.js';
Log.setLevel(Log.Level.ERROR);
const id = process.argv[2];
const yt = await Innertube.create({ lang: 'en', location: 'US', retrieve_player: true });
for (const client of ['WEB','ANDROID','IOS','MWEB','TV_EMBEDDED','WEB_EMBEDDED']) {
  try {
    const info = await yt.getInfo(id, client);
    const t = (info.captions?.caption_tracks ?? []).find(x => x.language_code?.startsWith('en'));
    if (!t) { console.log(`${client.padEnd(13)} sem faixa en`); continue; }
    const url = t.base_url.includes('fmt=') ? t.base_url : t.base_url + '&fmt=json3';
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const b = await r.text();
    const params = new URL(t.base_url).searchParams;
    console.log(`${client.padEnd(13)} status=${r.status} bytes=${String(b.length).padEnd(6)} params=${[...params.keys()].join(',')}`);
  } catch (e) { console.log(`${client.padEnd(13)} ERRO ${e.message.slice(0,70)}`); }
}
