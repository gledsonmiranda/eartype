'use client';

/**
 * The browser's own speech recognition (Web Speech API): free, no key, and
 * good enough for single words. Chrome and Edge have it; Firefox does not,
 * which is why `supported` exists. One word per listen — it stops by itself
 * when you stop talking.
 *
 * Failures come out as a short code, never the browser's own message.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

export type SpeechError = 'not-allowed' | 'no-speech' | 'network' | 'failed';

/** The slice of the Web Speech API this uses — not every TS DOM lib ships it. */
type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

function toError(code: string): SpeechError {
  if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') return 'not-allowed';
  if (code === 'no-speech') return 'no-speech';
  if (code === 'network') return 'network';
  return 'failed';
}

const noSubscription = () => () => {};

export function useSpeech() {
  /** `null` on the server, which can't know. */
  const supported = useSyncExternalStore(
    noSubscription,
    () => recognitionConstructor() !== null,
    () => null,
  );
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<SpeechError | null>(null);
  const current = useRef<Recognition | null>(null);

  useEffect(() => () => current.current?.abort(), []);

  /** Listens for one answer and hands back the recognizer's guesses, best first. */
  const listen = useCallback((onGuesses: (guesses: string[]) => void) => {
    const Constructor = recognitionConstructor();
    if (Constructor === null) return;

    current.current?.abort();
    const recognition = new Constructor();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 5;

    recognition.onresult = (event) => {
      const first = event.results[0];
      if (first === undefined) return;
      const guesses = Array.from(first, (alternative) => alternative.transcript).filter((text) => text.trim() !== '');
      if (guesses.length > 0) onGuesses(guesses);
    };
    recognition.onerror = (event) => {
      // `aborted` is us moving on, not a failure worth showing.
      if (event.error !== 'aborted') setError(toError(event.error));
    };
    recognition.onend = () => {
      setListening(false);
      if (current.current === recognition) current.current = null;
    };

    current.current = recognition;
    setError(null);
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      setError('failed');
    }
  }, []);

  const stop = useCallback(() => {
    current.current?.abort();
    current.current = null;
    setListening(false);
    setError(null);
  }, []);

  return { supported, listening, error, listen, stop };
}
