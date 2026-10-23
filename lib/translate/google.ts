/**
 * Translates a finished subtitle line to Portuguese through Google Translate.
 *
 * This is the free, undocumented `client=gtx` endpoint the translate.google.com
 * widgets use: no key, no billing — and no promise. It can rate-limit or change
 * its shape, so the parsing lives in one function and every failure becomes a
 * typed code the UI can turn into a calm message.
 *
 * `fetch` is injectable so the module can be tested without a network.
 */

export type TranslateErrorCode =
  /** 429 — the same request works again later. */
  | 'rate-limited'
  /** Anything else: a 5xx, a network error, a response we cannot read. */
  | 'provider-failed';

export class TranslateError extends Error {
  readonly code: TranslateErrorCode;

  constructor(code: TranslateErrorCode, message: string) {
    super(message);
    this.name = 'TranslateError';
    this.code = code;
  }
}

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

/**
 * The body is a nested array: `[[["traduzido", "original", …], …], …]`.
 * Google splits longer text into one chunk per sentence; the translation is
 * every chunk's first element, joined.
 */
export function parseGoogleResponse(json: unknown): string {
  const chunks = Array.isArray(json) ? json[0] : undefined;
  if (!Array.isArray(chunks)) {
    throw new TranslateError('provider-failed', 'resposta do tradutor em formato inesperado');
  }

  const translation = chunks
    .map((chunk) => (Array.isArray(chunk) && typeof chunk[0] === 'string' ? chunk[0] : ''))
    .join('')
    .trim();

  if (translation === '') {
    throw new TranslateError('provider-failed', 'resposta do tradutor em formato inesperado');
  }

  return translation;
}

export async function translateText(
  text: string,
  { fetch: fetchImpl = fetch, signal }: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<string> {
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({ client: 'gtx', sl: 'en', tl: 'pt', dt: 't', q: text }).toString();

  let response: Response;
  try {
    response = await fetchImpl(url, { signal });
  } catch {
    throw new TranslateError('provider-failed', 'não foi possível falar com o tradutor');
  }

  if (response.status === 429) {
    throw new TranslateError('rate-limited', 'o tradutor pediu uma pausa; tente de novo em instantes');
  }
  if (!response.ok) {
    throw new TranslateError('provider-failed', 'o tradutor respondeu com erro');
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new TranslateError('provider-failed', 'resposta do tradutor em formato inesperado');
  }

  return parseGoogleResponse(json);
}
