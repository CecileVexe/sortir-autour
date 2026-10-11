/**
 * Small cache abstraction:
 *  - Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN are set (shared by all serverless instances),
 *  - otherwise an in-memory LRU (per instance, lost on cold start — best effort only).
 *
 * TTLs follow the providers' freshness: places change slowly, events are perishable.
 */
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";
import { errorSummary, log } from "@/lib/log";

export const TTL = {
  geocode: 7 * 24 * 3600,
  places: 24 * 3600,
  wikidata: 7 * 24 * 3600,
  events: 2 * 3600,
  agendas: 24 * 3600,
} as const;

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSec: number): Promise<void>;
  readonly kind: "redis" | "memory";
}

class MemoryCache implements CacheStore {
  readonly kind = "memory" as const;
  private map = new Map<string, { v: unknown; exp: number }>();
  constructor(private maxEntries = 500) {}

  async get<T>(key: string): Promise<T | null> {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (hit.exp < Date.now()) {
      this.map.delete(key);
      return null;
    }
    // refresh LRU order
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.v as T;
  }

  async set<T>(key: string, value: T, ttlSec: number): Promise<void> {
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { v: value, exp: Date.now() + ttlSec * 1000 });
  }
}

class RedisCache implements CacheStore {
  readonly kind = "redis" as const;
  constructor(private redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      return (await this.redis.get<T>(key)) ?? null;
    } catch (err) {
      log.warn("cache.get failed", { err: errorSummary(err) });
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSec: number): Promise<void> {
    try {
      await this.redis.set(key, value, { ex: ttlSec });
    } catch (err) {
      log.warn("cache.set failed", { err: errorSummary(err) });
    }
  }
}

let store: CacheStore | null = null;
let redisClient: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = env();
  redisClient = url && token ? new Redis({ url, token }) : null;
  return redisClient;
}

export function getCache(): CacheStore {
  if (store) return store;
  const redis = getRedis();
  store = redis ? new RedisCache(redis) : new MemoryCache();
  return store;
}

/** For tests. */
export function __resetCacheForTests(s: CacheStore | null = null) {
  store = s;
  redisClient = undefined;
}

export function createMemoryCache(max?: number): CacheStore {
  return new MemoryCache(max);
}

const CACHE_VERSION = "v1";

export function cacheKey(...parts: (string | number)[]): string {
  return [CACHE_VERSION, ...parts].join(":");
}

interface StaleEnvelope<T> {
  v: T;
  /** Epoch ms after which the value is stale (still usable as a fallback). */
  freshUntil: number;
}

/**
 * Read-through cache that keeps an expired copy for `staleSec` and serves it when the loader fails
 * (e.g. public Overpass instance overloaded). `stale: true` tells the caller to mention it.
 */
export async function cachedWithStale<T>(
  key: string,
  ttlSec: number,
  staleSec: number,
  loader: () => Promise<T>,
): Promise<{ value: T; hit: boolean; stale: boolean }> {
  const c = getCache();
  const env = await c.get<StaleEnvelope<T>>(key);
  if (env && env.freshUntil > Date.now()) return { value: env.v, hit: true, stale: false };
  try {
    const value = await loader();
    await c.set<StaleEnvelope<T>>(key, { v: value, freshUntil: Date.now() + ttlSec * 1000 }, Math.max(ttlSec, staleSec));
    return { value, hit: false, stale: false };
  } catch (err) {
    if (env) return { value: env.v, hit: true, stale: true };
    throw err;
  }
}

/** Read-through helper. `loader` errors are not cached. */
export async function cached<T>(key: string, ttlSec: number, loader: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  const c = getCache();
  const hit = await c.get<T>(key);
  if (hit !== null) return { value: hit, hit: true };
  const value = await loader();
  await c.set(key, value, ttlSec);
  return { value, hit: false };
}
