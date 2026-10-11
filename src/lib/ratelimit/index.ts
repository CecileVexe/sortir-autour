/**
 * Rate limiting for public routes.
 *
 * - With Upstash Redis configured: global sliding window shared by every serverless instance (reliable).
 * - Without it: in-memory fixed window per instance. This is BEST EFFORT ONLY — on Vercel each instance
 *   has its own memory and instances are recycled, so a determined client can exceed the limit.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "@/lib/cache";
import { errorSummary, log } from "@/lib/log";

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfterSec: number;
  backend: "redis" | "memory";
}

const memoryWindows = new Map<string, { count: number; resetAt: number }>();
const limiters = new Map<string, Ratelimit>();

function memoryLimit(key: string, limit: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  let w = memoryWindows.get(key);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + windowSec * 1000 };
    memoryWindows.set(key, w);
    if (memoryWindows.size > 5000) {
      for (const [k, v] of memoryWindows) if (v.resetAt <= now) memoryWindows.delete(k);
    }
  }
  w.count += 1;
  return {
    ok: w.count <= limit,
    limit,
    remaining: Math.max(0, limit - w.count),
    retryAfterSec: Math.max(1, Math.ceil((w.resetAt - now) / 1000)),
    backend: "memory",
  };
}

export async function rateLimit(bucket: string, identifier: string, limit: number, windowSec = 60): Promise<RateLimitResult> {
  const key = `${bucket}:${identifier}`;
  const redis = getRedis();
  if (!redis) return memoryLimit(key, limit, windowSec);

  const id = `${bucket}:${limit}:${windowSec}`;
  let rl = limiters.get(id);
  if (!rl) {
    rl = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`), prefix: `rl:${bucket}`, analytics: false });
    limiters.set(id, rl);
  }
  try {
    const r = await rl.limit(identifier);
    return {
      ok: r.success,
      limit: r.limit,
      remaining: r.remaining,
      retryAfterSec: Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)),
      backend: "redis",
    };
  } catch (err) {
    // Redis down: degrade to memory rather than blocking everyone.
    log.warn("ratelimit redis failed, using memory", { err: errorSummary(err) });
    return memoryLimit(key, limit, windowSec);
  }
}

/** Client identifier from proxy headers (Vercel sets x-forwarded-for). Hashed-free but never logged. */
export function clientId(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip") || "anonymous";
}

export function __resetRateLimitForTests() {
  memoryWindows.clear();
  limiters.clear();
}
