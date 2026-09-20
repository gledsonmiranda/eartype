import { Innertube, Log } from 'youtubei.js';
Log.setLevel(Log.Level.ERROR);
const id = process.argv[2];
for (const client of ['WEB', 'ANDROID', 'IOS', 'MWEB', 'TV_EMBEDDED', 'WEB_EMBEDDED']) {
  try {
    const yt = await Innertube.create({ lang: 'en', location: 'US', retrieve_player: true });
    const info = await yt.getInfo(id, client);
    const ps = info.playability_status ?? {};
    const tracks = info.captions?.caption_tracks ?? [];
    console.log(`${client.padEnd(13)} status=${ps.status} reason=${(ps.reason||'-')} tracks=${tracks.length ? tracks.map(t=>t.language_code+(t.kind==='asr'?'/asr':'')).join(',') : 'NENHUMA'}`);
  } catch (e) {
    console.log(`${client.padEnd(13)} ERRO: ${e.message.slice(0,90)}`);
  }
}
