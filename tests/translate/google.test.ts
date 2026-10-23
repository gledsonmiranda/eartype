/**
 * The Google side of line translation, without Google: `fetch` is injected,
 * so the response shapes and failure codes are checked offline.
 */

import { describe, expect, it } from 'vitest';
import { parseGoogleResponse, translateText, TranslateError } from '@/lib/translate/google';

function fakeFetch(status: number, body: unknown): typeof fetch {
  return async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}

describe('parseGoogleResponse', () => {
  it('reads a single chunk', () => {
    expect(parseGoogleResponse([[['olá mundo', 'hello world', null, null, 10]], null, 'en'])).toBe('olá mundo');
  });

  it('joins one chunk per sentence', () => {
    const json = [
      [
        ['Eu vou. ', 'I am going. ', null, null, 10],
        ['Você vem?', 'Are you coming?', null, null, 10],
      ],
      null,
      'en',
    ];
    expect(parseGoogleResponse(json)).toBe('Eu vou. Você vem?');
  });

  it('rejects a shape it does not know', () => {
    expect(() => parseGoogleResponse({ text: 'olá' })).toThrow(TranslateError);
    expect(() => parseGoogleResponse([[]])).toThrow(TranslateError);
  });
});

describe('translateText', () => {
  it('returns the translation', async () => {
    const result = await translateText('hello', { fetch: fakeFetch(200, [[['olá', 'hello']]]) });
    expect(result).toBe('olá');
  });

  it('asks for English to Portuguese', async () => {
    let requested = '';
    const spy: typeof fetch = async (input) => {
      requested = String(input);
      return new Response(JSON.stringify([[['olá', 'hello']]]));
    };
    await translateText("don't go", { fetch: spy });
    const params = new URL(requested).searchParams;
    expect(params.get('sl')).toBe('en');
    expect(params.get('tl')).toBe('pt');
    expect(params.get('q')).toBe("don't go");
  });

  it.each([
    [429, 'rate-limited'],
    [500, 'provider-failed'],
  ])('maps HTTP %i to %s', async (status, code) => {
    await expect(translateText('hello', { fetch: fakeFetch(status, '') })).rejects.toMatchObject({ code });
  });

  it('maps a network failure and an unreadable body to provider-failed', async () => {
    const offline: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    await expect(translateText('hello', { fetch: offline })).rejects.toMatchObject({ code: 'provider-failed' });
    await expect(translateText('hello', { fetch: fakeFetch(200, '<html>') })).rejects.toMatchObject({
      code: 'provider-failed',
    });
  });
});
