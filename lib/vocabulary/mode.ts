/**
 * How you answer: typing (the default) or speaking. The choice sticks — across
 * words, sessions and visits — until you switch it back.
 */

import { read, write } from '@/lib/storage/local';

export type AnswerMode = 'type' | 'voice';

export const DEFAULT_MODE: AnswerMode = 'type';

const MODE_KEY = 'eartype:vocabulary-mode';

export function parseMode(value: unknown): AnswerMode | null {
  return value === 'type' || value === 'voice' ? value : null;
}

export function loadMode(): AnswerMode {
  return parseMode(read(MODE_KEY)) ?? DEFAULT_MODE;
}

export function saveMode(mode: AnswerMode): void {
  write(MODE_KEY, mode);
}
