'use client';

/**
 * Mounts the YouTube iframe and hands the player up once it is usable.
 *
 * Everything about *when to pause* lives in `lib/player/segment-playback`;
 * this component only owns the element's life cycle.
 */

import { useEffect, useRef } from 'react';
import {
  createPlayer,
  type PlayerErrorCode,
  type YouTubePlayer,
} from '@/lib/player/youtube-iframe';

export type VideoPlayerProps = {
  videoId: string;
  onReady: (player: YouTubePlayer) => void;
  onError: (code: PlayerErrorCode) => void;
  /** Blurs the bottom of the picture, where burned-in subtitles sit. */
  blurCaptions?: boolean;
};

export { CaptionBlurToggle } from './CaptionBlurToggle';
export { useCaptionBlur } from './useCaptionBlur';

export function VideoPlayer({ videoId, onReady, onError, blurCaptions = false }: VideoPlayerProps) {
  const mount = useRef<HTMLDivElement>(null);
  // The callbacks change identity on every render; the player must not.
  const handlers = useRef({ onReady, onError });

  useEffect(() => {
    handlers.current = { onReady, onError };
  }, [onReady, onError]);

  useEffect(() => {
    const element = mount.current;
    if (element === null) return;

    let player: YouTubePlayer | null = null;
    let cancelled = false;

    const host = document.createElement('div');
    element.appendChild(host);

    void createPlayer(host, {
      videoId,
      onReady: (created) => {
        if (!cancelled) handlers.current.onReady(created);
      },
      onError: (code) => {
        if (!cancelled) handlers.current.onError(code);
      },
    })
      .then((created) => {
        player = created;
        if (cancelled) created.destroy();
      })
      .catch(() => {
        if (!cancelled) handlers.current.onError('playback');
      });

    return () => {
      cancelled = true;
      player?.destroy();
      host.remove();
    };
  }, [videoId]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black [&_iframe]:h-full [&_iframe]:w-full">
      <div ref={mount} className="h-full w-full" />
      {blurCaptions && (
        // ~100px on the 720px player; scales with the video. Clicks pass
        // through so the YouTube controls underneath still work.
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-black/30 backdrop-blur-xl"
        />
      )}
    </div>
  );
}
