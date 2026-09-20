/**
 * The DOM half of RF-04: loads the IFrame API and creates a player.
 *
 * Deliberately thin — the rules worth testing live in `segment-playback.ts`.
 * What is here is the part that can only be checked in a browser: the script
 * tag, the global callback the API insists on, and the player options that
 * keep the answer off the screen (R-04).
 */

import type { PlayerPort } from './segment-playback';

export type YouTubePlayer = PlayerPort & {
  destroy(): void;
  getPlayerState(): number;
  setPlaybackRate(rate: number): void;
};

type PlayerEvent = { target: YouTubePlayer; data: number };

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    config: {
      videoId: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady?: (event: PlayerEvent) => void;
        onError?: (event: PlayerEvent) => void;
        onStateChange?: (event: PlayerEvent) => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: { UNSTARTED: -1; ENDED: 0; PLAYING: 1; PAUSED: 2; BUFFERING: 3; CUED: 5 };
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** R-03 — the four errors the player can report, as something the UI can say. */
export type PlayerErrorCode = 'embed-blocked' | 'video-not-found' | 'bad-parameter' | 'playback';

export function playerErrorCode(code: number): PlayerErrorCode {
  if (code === 101 || code === 150) return 'embed-blocked';
  if (code === 100) return 'video-not-found';
  if (code === 2) return 'bad-parameter';
  return 'playback';
}

/** User-facing, in Portuguese — these reach the screen as they are. */
export const PLAYER_ERROR_MESSAGES: Record<PlayerErrorCode, string> = {
  'embed-blocked':
    'o dono deste vídeo não permite reproduzi-lo fora do YouTube — escolha outro vídeo',
  'video-not-found': 'este vídeo não existe mais',
  'bad-parameter': 'o endereço do vídeo é inválido',
  playback: 'o player do YouTube não conseguiu tocar este vídeo',
};

const API_URL = 'https://www.youtube.com/iframe_api';

let apiPromise: Promise<YouTubeApi> | null = null;

/** Loads the IFrame API once per page, however many players ask for it. */
export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    // The API calls this global when it finishes loading; there is no other way in.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube IFrame API loaded without a Player'));
    };

    const script = document.createElement('script');
    script.src = API_URL;
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('could not load the YouTube IFrame API'));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}

export type CreatePlayerOptions = {
  videoId: string;
  onReady: (player: YouTubePlayer) => void;
  onError: (code: PlayerErrorCode) => void;
  onStateChange?: (state: number) => void;
};

export async function createPlayer(
  element: HTMLElement,
  options: CreatePlayerOptions,
): Promise<YouTubePlayer> {
  const api = await loadYouTubeApi();

  return new api.Player(element, {
    videoId: options.videoId,
    playerVars: {
      // R-04: the captions are the answer. They stay off, and out of reach.
      cc_load_policy: 0,
      iv_load_policy: 3,
      controls: 1,
      disablekb: 1, // The keyboard belongs to the textarea.
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
    },
    events: {
      onReady: (event) => options.onReady(event.target),
      onError: (event) => options.onError(playerErrorCode(event.data)),
      onStateChange: (event) => options.onStateChange?.(event.data),
    },
  });
}
