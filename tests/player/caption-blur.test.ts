import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadCaptionBlur, saveCaptionBlur } from '@/lib/player/caption-blur';

describe('caption blur', () => {
  let items: Map<string, string>;

  beforeEach(() => {
    items = new Map();
    const stub = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    } as Storage;
    Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('starts off', () => {
    expect(loadCaptionBlur()).toBe(false);
  });

  it('remembers the choice', () => {
    saveCaptionBlur(true);
    expect(loadCaptionBlur()).toBe(true);
    saveCaptionBlur(false);
    expect(loadCaptionBlur()).toBe(false);
  });

  it('ignores anything that is not a boolean', () => {
    items.set('eartype:caption-blur', '"yes"');
    expect(loadCaptionBlur()).toBe(false);
  });
});
