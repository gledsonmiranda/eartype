/**
 * RF-01 — extrai o videoId (e o start opcional) de qualquer forma de entrada
 * que o usuário possa colar: URL completa, youtu.be, embed, shorts ou o ID puro.
 */

export type ParsedVideo = {
  videoId: string;
  /** Segundos vindos de `t=` / `start=`, quando presentes. */
  startSec?: number;
};

/** IDs do YouTube têm exatamente 11 caracteres deste alfabeto. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const HOSTS_CURTOS = new Set(['youtu.be']);
const HOSTS_LONGOS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

/** Segmentos de caminho que carregam o ID logo depois deles: /embed/ID, /shorts/ID... */
const PREFIXOS_DE_CAMINHO = new Set(['embed', 'shorts', 'v', 'live', 'e']);

/**
 * `t=90`, `t=90s`, `t=1m30s`, `t=1h2m3s`, `start=90`.
 * Retorna `undefined` quando não dá para ler um número de segundos.
 */
export function parseTimeParam(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === '') return undefined;

  // Só dígitos (com `s` opcional no fim): segundos diretos.
  const simples = /^(\d+)s?$/.exec(v);
  if (simples) return Number(simples[1]);

  const composto = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v);
  if (composto && (composto[1] || composto[2] || composto[3])) {
    const h = Number(composto[1] ?? 0);
    const m = Number(composto[2] ?? 0);
    const s = Number(composto[3] ?? 0);
    return h * 3600 + m * 60 + s;
  }

  return undefined;
}

function comStart(videoId: string, start: number | undefined): ParsedVideo {
  return start === undefined ? { videoId } : { videoId, startSec: start };
}

/** Lê `t` ou `start` de uma query string, nessa ordem de preferência. */
function lerStart(params: URLSearchParams): number | undefined {
  return parseTimeParam(params.get('t')) ?? parseTimeParam(params.get('start'));
}

export function parseYouTubeUrl(input: string): ParsedVideo | null {
  const texto = input?.trim();
  if (!texto) return null;

  // Caso mais simples: o ID puro, colado sozinho.
  if (VIDEO_ID.test(texto)) return { videoId: texto };

  // `youtube.com/watch?v=...` sem protocolo ainda é uma URL válida para o usuário.
  const comProtocolo = /^[a-z][a-z0-9+.-]*:\/\//i.test(texto) ? texto : `https://${texto}`;

  let url: URL;
  try {
    url = new URL(comProtocolo);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const partes = url.pathname.split('/').filter(Boolean);
  const start = lerStart(url.searchParams);

  if (HOSTS_CURTOS.has(host)) {
    const id = partes[0];
    return id && VIDEO_ID.test(id) ? comStart(id, start) : null;
  }

  if (!HOSTS_LONGOS.has(host)) return null;

  // /watch?v=ID — a lista de reprodução e o índice são ignorados de propósito.
  const doQuery = url.searchParams.get('v');
  if (doQuery && VIDEO_ID.test(doQuery)) return comStart(doQuery, start);

  if (partes.length >= 2 && PREFIXOS_DE_CAMINHO.has(partes[0].toLowerCase())) {
    const id = partes[1];
    if (VIDEO_ID.test(id)) return comStart(id, start);
  }

  return null;
}
