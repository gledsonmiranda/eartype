/**
 * localStorage, wrapped. Private windows, a full quota or the server render
 * all turn into "nothing saved", never a crash.
 */

export function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function read(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw === null || raw === undefined ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function write(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or a blocked storage: the value just isn't kept.
  }
}

export function remove(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing to clear if storage is unreachable.
  }
}
