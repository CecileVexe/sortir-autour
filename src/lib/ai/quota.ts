/**
 * Owner-side cost controls for AI calls:
 *  - global daily cap (AI_DAILY_LIMIT), counted in Redis when configured (shared), else per instance,
 *  - per-visitor hourly cap (AI_PER_USER_PER_HOUR) via the rate limiter.
 * Provider-side spending caps must also be set in the provider console when available.
 */
import { getRedis } from "@/lib/cache";
import { env } from "@/lib/env";
import { errorSummary, log } from "@/lib/log";
import { rateLimit } from "@/lib/ratelimit";
import { AiError } from "@/lib/ai/types";
import { parisDate } from "@/lib/search/dates";

const memoryDaily = new Map<string, number>();

async function incrementDaily(): Promise<number> {
  const key = `ai:daily:${parisDate(new Date())}`;
  const redis = getRedis();
  if (redis) {
    try {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, 36 * 3600);
      return n;
    } catch (err) {
      log.warn("ai daily counter redis failed", { err: errorSummary(err) });
    }
  }
  const n = (memoryDaily.get(key) ?? 0) + 1;
  memoryDaily.clear();
  memoryDaily.set(key, n);
  return n;
}

/** Throws AiError when a cap is reached; otherwise records the call. */
export async function consumeAiQuota(clientId: string): Promise<void> {
  const { AI_DAILY_LIMIT, AI_PER_USER_PER_HOUR } = env();
  if (AI_DAILY_LIMIT === 0 || AI_PER_USER_PER_HOUR === 0) throw new AiError("not_configured");
  const user = await rateLimit("ai", clientId, AI_PER_USER_PER_HOUR, 3600);
  if (!user.ok) throw new AiError("user_limit", { retryAfterSec: user.retryAfterSec });
  const n = await incrementDaily();
  if (n > AI_DAILY_LIMIT) throw new AiError("daily_limit");
}

export function __resetAiQuotaForTests() {
  memoryDaily.clear();
}
