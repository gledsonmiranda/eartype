/**
 * Whether the bottom of the video is blurred to hide subtitles burned into the
 * picture. Off by default; the choice sticks across videos and visits.
 */

import { read, write } from '@/lib/storage/local';

const BLUR_KEY = 'eartype:caption-blur';

export function loadCaptionBlur(): boolean {
  return read(BLUR_KEY) === true;
}

export function saveCaptionBlur(on: boolean): void {
  write(BLUR_KEY, on);
}
