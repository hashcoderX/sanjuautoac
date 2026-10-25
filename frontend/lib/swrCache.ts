/**
 * Tiny stale-while-revalidate (SWR) cache backed by sessionStorage.
 *
 * Usage pattern:
 *   const cached = readCache<T>(key, ttlMs);
 *   if (cached) applyToState(cached);      // render instantly
 *   const fresh = await fetcher();         // revalidate in background
 *   writeCache(key, fresh);                // store for next visit
 *
 * sessionStorage is per-tab and cleared when the tab closes, so cached
 * data never persists beyond the browsing session.
 */

const PREFIX = 'swr:';

interface CacheEnvelope<T> {
  t: number; // timestamp (ms)
  d: T;      // data
}

export function readCache<T>(key: string, maxAgeMs: number): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.t !== 'number') return null;
    if (Date.now() - parsed.t > maxAgeMs) return null;
    return parsed.d;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    const envelope: CacheEnvelope<T> = { t: Date.now(), d: data };
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(envelope));
  } catch {
    // Quota exceeded or storage unavailable — ignore, caching is best-effort.
  }
}

export function clearCacheByPrefix(prefix: string): void {
  if (typeof window === 'undefined') return;
  try {
    const full = PREFIX + prefix;
    const toDelete: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(full)) toDelete.push(k);
    }
    toDelete.forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    // ignore
  }
}
