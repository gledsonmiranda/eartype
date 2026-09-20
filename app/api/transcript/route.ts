/**
 * `GET /api/transcript?videoId=<id>` — the automatic caption path (RF-02).
 *
 * Thin on purpose: validate, delegate to `lib/youtube/transcript`, map the
 * typed error onto a status the UI can branch on. Everything worth testing
 * lives in the lib, which needs no route and no network to exercise.
 *
 * No `export const runtime`: `nodejs` is the default in this version and the
 * Edge runtime is deprecated, so the export the plan called for would now be
 * the wrong thing to write. The handler does need Node — it spawns yt-dlp.
 */

import { getTranscript, TranscriptError, type TranscriptErrorCode } from '@/lib/youtube/transcript';
import { parseYouTubeUrl } from '@/lib/youtube/parse-url';

const STATUS: Record<TranscriptErrorCode, number> = {
  'no-english-captions': 404,
  'video-unavailable': 404,
  'rate-limited': 503,
  'tool-missing': 500,
  'provider-failed': 502,
};

export async function GET(request: Request): Promise<Response> {
  const parameters = new URL(request.url).searchParams;
  const raw = parameters.get('videoId') ?? '';
  const parsed = parseYouTubeUrl(raw);

  if (parsed === null) {
    return Response.json(
      { error: { code: 'invalid-video-id', message: 'videoId inválido' } },
      { status: 400 },
    );
  }

  try {
    const transcript = await getTranscript(parsed.videoId, {
      force: parameters.get('force') === '1',
    });

    return Response.json(transcript, {
      // Captions do not change; the client caches them too (§7.3).
      headers: { 'Cache-Control': 'private, max-age=3600' },
    });
  } catch (error) {
    if (error instanceof TranscriptError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: STATUS[error.code] },
      );
    }

    throw error;
  }
}
