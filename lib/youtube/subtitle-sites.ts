/**
 * Third-party sites that download a YouTube caption file, with the link that
 * opens each one already filled in for a given video.
 */

export type SubtitleSite = {
  name: string;
  /** The deep link that opens the site on this video's download page. */
  href: (videoId: string) => string;
};

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export const SUBTITLE_SITES: SubtitleSite[] = [
  {
    name: 'DownSub',
    href: (videoId) => `https://downsub.com/?url=${encodeURIComponent(watchUrl(videoId))}`,
  },
  {
    name: 'SaveSubs',
    href: (videoId) => `https://savesubs.com/process?url=${encodeURIComponent(watchUrl(videoId))}`,
  },
];
