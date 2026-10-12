/**
 * Feature 2 — caching system.
 *
 * A small TTL + LRU cache used to avoid repeating identical external API calls.
 * It is intentionally in-process only: the dashboard runs as a single Next.js
 * server, so an in-memory map removes the Redis dependency while still serving
 * repeated requests instantly.
 *
 * `stale` entries are returned when a refresh fails, so a provider outage
 * degrades to slightly old data instead of an error.
 */

interface Entry<T> {
  value: T;
  expires: number;
  staleUntil: number;
}

export interface CacheOptions {
  /** Fresh lifetime in milliseconds. */
  ttlMs: number;
  /** Extra window during which a stale value may still be served. */
  staleMs?: number;
  /** Maximum number of live keys before the oldest is evicted. */
  maxEntries?: number;
}

const store = new Map<string, Entry<unknown>>();
let hits = 0;
let misses = 0;

/** In-flight requests keyed the same way, so concurrent callers share one fetch. */
const inflight = new Map<string, Promise<unknown>>();

function evictIfNeeded(maxEntries: number) {
  // Map preserves insertion order, so the first key is the least recently written.
  while (store.size > maxEntries) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key) as Entry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expires) return undefined;
  // Re-insert to mark as recently used.
  store.delete(key);
  store.set(key, entry);
  return entry.value;
}

/** Returns a value even if it is past its TTL but inside the stale window. */
function cacheGetStale<T>(key: string): T | undefined {
  const entry = store.get(key) as Entry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.staleUntil) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function cacheSet<T>(key: string, value: T, options: CacheOptions): void {
  const { ttlMs, staleMs = 0, maxEntries = 500 } = options;
  store.delete(key);
  store.set(key, { value, expires: Date.now() + ttlMs, staleUntil: Date.now() + ttlMs + staleMs });
  evictIfNeeded(maxEntries);
}

/**
 * Cached fetch: serve from cache when fresh, otherwise run `loader` once.
 * On failure, fall back to a stale value when one exists.
 */
export async function cached<T>(key: string, options: CacheOptions, loader: () => Promise<T>): Promise<T> {
  const fresh = cacheGet<T>(key);
  if (fresh !== undefined) {
    hits += 1;
    return fresh;
  }

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) {
    hits += 1;
    return existing;
  }

  misses += 1;
  const task = (async () => {
    try {
      const value = await loader();
      cacheSet(key, value, options);
      return value;
    } catch (error) {
      const stale = cacheGetStale<T>(key);
      if (stale !== undefined) {
        console.warn(`[cache] using stale value for ${key}`);
        return stale;
      }
      throw error;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

export function cacheStats() {
  return { size: store.size, hits, misses, hitRate: hits + misses === 0 ? 0 : hits / (hits + misses) };
}

export function cacheClear() {
  store.clear();
  inflight.clear();
  hits = 0;
  misses = 0;
}