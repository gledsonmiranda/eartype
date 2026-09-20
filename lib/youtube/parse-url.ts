/**
 * RF-01 — extracts the videoId (and an optional start time) from whatever the
 * user pastes: a full URL, youtu.be, an embed, a short, or the bare ID.
 */

export type ParsedVideo = {
  videoId: string;
  /** Seconds from `t=` / `start=`, when present. */
  startSec?: number;
};

/** YouTube IDs are exactly 11 characters from this alphabet. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const SHORT_HOSTS = new Set(['youtu.be']);
const FULL_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

/** Path segments that carry the ID right after them: /embed/ID, /shorts/ID... */
const ID_BEARING_PATHS = new Set(['embed', 'shorts', 'v', 'live', 'e']);

/**
 * `t=90`, `t=90s`, `t=1m30s`, `t=1h2m3s`, `start=90`.
 * Returns `undefined` when no number of seconds can be read.
 */
export function parseTimeParam(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase();
  if (value === '') return undefined;

  // Digits only (with an optional trailing `s`): plain seconds.
  const plain = /^(\d+)s?$/.exec(value);
  if (plain) return Number(plain[1]);

  const compound = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (compound && (compound[1] || compound[2] || compound[3])) {
    const hours = Number(compound[1] ?? 0);
    const minutes = Number(compound[2] ?? 0);
    const seconds = Number(compound[3] ?? 0);
    return hours * 3600 + minutes * 60 + seconds;
  }

  return undefined;
}

function withStart(videoId: string, startSec: number | undefined): ParsedVideo {
  return startSec === undefined ? { videoId } : { videoId, startSec };
}

/** Reads `t` or `start` from a query string, in that order of preference. */
function readStart(params: URLSearchParams): number | undefined {
  return parseTimeParam(params.get('t')) ?? parseTimeParam(params.get('start'));
}

export function parseYouTubeUrl(input: string): ParsedVideo | null {
  const text = input?.trim();
  if (!text) return null;

  // Simplest case: the bare ID, pasted on its own.
  if (VIDEO_ID.test(text)) return { videoId: text };

  // `youtube.com/watch?v=...` without a scheme is still a valid URL to a user.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const pathParts = url.pathname.split('/').filter(Boolean);
  const startSec = readStart(url.searchParams);

  if (SHORT_HOSTS.has(host)) {
    const id = pathParts[0];
    return id && VIDEO_ID.test(id) ? withStart(id, startSec) : null;
  }

  if (!FULL_HOSTS.has(host)) return null;

  // /watch?v=ID — the playlist and index are ignored on purpose.
  const fromQuery = url.searchParams.get('v');
  if (fromQuery && VIDEO_ID.test(fromQuery)) return withStart(fromQuery, startSec);

  if (pathParts.length >= 2 && ID_BEARING_PATHS.has(pathParts[0].toLowerCase())) {
    const id = pathParts[1];
    if (VIDEO_ID.test(id)) return withStart(id, startSec);
  }

  return null;
}
