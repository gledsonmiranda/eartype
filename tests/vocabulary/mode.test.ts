import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_MODE, loadMode, parseMode, saveMode } from '@/lib/vocabulary/mode';

describe('parseMode', () => {
  it('accepts the two modes and nothing else', () => {
    expect(parseMode('type')).toBe('type');
    expect(parseMode('voice')).toBe('voice');
    expect(parseMode('VOICE')).toBeNull();
    expect(parseMode(null)).toBeNull();
  });
});

describe('storage', () => {
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

  it('starts on typing', () => {
    expect(DEFAULT_MODE).toBe('type');
    expect(loadMode()).toBe('type');
  });

  it('remembers voice until switched back', () => {
    saveMode('voice');
    expect(loadMode()).toBe('voice');
    saveMode('type');
    expect(loadMode()).toBe('type');
  });

  it('falls back to typing on a corrupt value', () => {
    items.set('eartype:vocabulary-mode', '"shout"');
    expect(loadMode()).toBe('type');
  });
});
