/**
 * `GET /api/translate?text=<line>` — a finished subtitle line in Portuguese.
 *
 * Thin like the transcript route: validate, delegate to `lib/translate/google`,
 * map the typed error onto a status. Going through our own server keeps the
 * browser out of Google's CORS rules and gives one place to cache.
 */

import { translateText, TranslateError, type TranslateErrorCode } from '@/lib/translate/google';

/** A line is 3–8s of speech (SPEC §2); anything this long is not a line. */
const MAX_LENGTH = 500;

const STATUS: Record<TranslateErrorCode, number> = {
  'rate-limited': 503,
  'provider-failed': 502,
};

export async function GET(request: Request): Promise<Response> {
  const text = (new URL(request.url).searchParams.get('text') ?? '').trim();

  if (text === '' || text.length > MAX_LENGTH) {
    return Response.json(
      { error: { code: 'invalid-text', message: 'texto inválido para tradução' } },
      { status: 400 },
    );
  }

  try {
    const translation = await translateText(text, { signal: request.signal });

    return Response.json(
      { translation },
      // A line's translation does not change; the client caches it too.
      { headers: { 'Cache-Control': 'private, max-age=86400' } },
    );
  } catch (error) {
    if (error instanceof TranslateError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: STATUS[error.code] },
      );
    }

    throw error;
  }
}
