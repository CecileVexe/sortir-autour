import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractJson, getAiProvider, sanitizeAiText } from "@/lib/ai";
import { explainResults } from "@/lib/ai/explain";
import { groqProvider, mapGroqError } from "@/lib/ai/groq";
import { applyInterpretation, interpretationSchema } from "@/lib/ai/interpretation";
import { interpretIdeal } from "@/lib/ai/interpret";
import { __resetAiQuotaForTests, consumeAiQuota } from "@/lib/ai/quota";
import { AI_MESSAGES, AiError } from "@/lib/ai/types";
import { __resetCacheForTests } from "@/lib/cache";
import { __resetRateLimitForTests } from "@/lib/ratelimit";
import { defaultDraft } from "@/lib/search/criteria";
import { makeActivity, makeCriteria } from "@/test-utils/factory";

const ENV_KEYS = ["AI_PROVIDER", "GROQ_API_KEY", "AI_DAILY_LIMIT", "AI_PER_USER_PER_HOUR", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.AI_PROVIDER = "groq";
  process.env.GROQ_API_KEY = "test-key-not-real";
  __resetCacheForTests();
  __resetRateLimitForTests();
  __resetAiQuotaForTests();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}
const completion = (content: string) => ({ choices: [{ message: { content } }] });

describe("provider configuration", () => {
  it("is disabled without key or with AI_PROVIDER=none", () => {
    delete process.env.GROQ_API_KEY;
    expect(getAiProvider()).toBeNull();
    process.env.GROQ_API_KEY = "k";
    process.env.AI_PROVIDER = "none";
    expect(getAiProvider()).toBeNull();
    process.env.AI_PROVIDER = "groq";
    expect(getAiProvider()?.id).toBe("groq");
  });
});

describe("error mapping (quota, credit, key, outage)", () => {
  it.each([
    [429, { error: { code: "rate_limit_exceeded" } }, "quota_exceeded"],
    [402, {}, "credit_exhausted"],
    [400, { error: { code: "insufficient_quota" } }, "credit_exhausted"],
    [401, { error: { code: "invalid_api_key" } }, "invalid_key"],
    [503, {}, "unavailable"],
  ])("HTTP %i → %s", (status, body, code) => {
    expect(mapGroqError(status, body, null).code).toBe(code);
  });
  it("keeps Retry-After for 429", () => {
    expect(mapGroqError(429, {}, "17").retryAfterSec).toBe(17);
  });
  it("every error has a user message mentioning the classic search fallback", () => {
    expect(AI_MESSAGES.quota_exceeded).toContain("filtres classiques");
    for (const code of Object.keys(AI_MESSAGES) as (keyof typeof AI_MESSAGES)[]) expect(new AiError(code).userMessage.length).toBeGreaterThan(20);
  });
  it("network failure → unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(groqProvider.complete([{ role: "user", content: "x" }], { maxTokens: 10, json: false })).rejects.toMatchObject({ code: "unavailable" });
  });
  it("429 from Groq surfaces as quota_exceeded", async () => {
    mockFetch(429, { error: { message: "Rate limit reached", code: "rate_limit_exceeded" } }, { "retry-after": "30" });
    await expect(interpretIdeal("Une sortie au calme dimanche")).rejects.toMatchObject({ code: "quota_exceeded", retryAfterSec: 30 });
  });
  it("never sends the key anywhere but the Authorization header", async () => {
    const fn = mockFetch(200, completion("{}"));
    await groqProvider.complete([{ role: "user", content: "x" }], { maxTokens: 10, json: true });
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("test-key");
    expect(String(init.body)).not.toContain("test-key");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key-not-real");
  });
});

describe("quotas", () => {
  it("enforces the per-visitor hourly cap", async () => {
    process.env.AI_PER_USER_PER_HOUR = "2";
    await consumeAiQuota("1.2.3.4");
    await consumeAiQuota("1.2.3.4");
    await expect(consumeAiQuota("1.2.3.4")).rejects.toMatchObject({ code: "user_limit" });
    await expect(consumeAiQuota("5.6.7.8")).resolves.toBeUndefined();
  });
  it("enforces the global daily cap", async () => {
    process.env.AI_DAILY_LIMIT = "2";
    await consumeAiQuota("a");
    await consumeAiQuota("b");
    await expect(consumeAiQuota("c")).rejects.toMatchObject({ code: "daily_limit" });
  });
  it("a limit of 0 disables AI", async () => {
    process.env.AI_DAILY_LIMIT = "0";
    await expect(consumeAiQuota("a")).rejects.toMatchObject({ code: "not_configured" });
  });
});

describe("interpretation", () => {
  it("keeps valid fields and drops invented values", () => {
    const i = interpretationSchema.parse({
      categories: ["heritage", "casino-royal", "heritage"],
      budget: "cheap-ish",
      environment: "outdoor",
      radiusKm: 30,
      when: { kind: "date", date: "2026-10-18" },
      summary: "ok",
    });
    expect(i.categories).toEqual(["heritage"]);
    expect(i.budget).toBeUndefined();
    expect(i.environment).toBe("outdoor");
  });
  it("parses a model answer, drops past dates and strips URLs", async () => {
    mockFetch(
      200,
      completion(
        'Voici : {"categories":["unusual"],"companions":["couple"],"fame":"hidden","budget":"10-25","when":{"kind":"date","date":"2020-01-01"},"radiusKm":30,"summary":"Sortie originale à deux, voir https://evil.example"}',
      ),
    );
    const i = await interpretIdeal("Une sortie originale pour deux, budget raisonnable", new Date("2026-10-14T10:00:00+02:00"));
    expect(i).toMatchObject({ categories: ["unusual"], companions: ["couple"], fame: "hidden", budget: "10-25", radiusKm: 30 });
    expect(i.when).toBeUndefined();
    expect(i.summary).not.toContain("http");
  });
  it("applies onto a draft without touching the starting point", () => {
    const d = { ...defaultDraft(), origin: { label: "Lyon", lat: 45.7, lon: 4.8, city: "Lyon", citycode: null, department: null } };
    const out = applyInterpretation(d, { categories: ["nature"], radiusKm: 15, keywords: "cascade" });
    expect(out.origin?.label).toBe("Lyon");
    expect(out.categories).toEqual(["nature"]);
    expect(out.radiusKm).toBe(15);
    expect(out.query).toBe("cascade");
  });
  it("rejects non-JSON answers", () => {
    expect(() => extractJson("désolé, je ne peux pas")).toThrow(AiError);
  });
});

describe("explanations", () => {
  it("only keeps ids that were sent and sanitises text", async () => {
    const a = { ...makeActivity({ name: "Château" }), score: 1, reasons: [], unverified: [], nextDate: null };
    mockFetch(200, completion(JSON.stringify({ summary: "Deux idées.", items: [{ id: a.id, why: "Proche et gratuit www.spam.fr" }, { id: "osm:n999", why: "inventé" }] })));
    const e = await explainResults(makeCriteria(), [a]);
    expect(e.items).toEqual([{ id: a.id, why: "Proche et gratuit" }]);
    expect(e.summary).toBe("Deux idées.");
  });
  it("throws bad_output when nothing usable comes back", async () => {
    const a = { ...makeActivity(), score: 1, reasons: [], unverified: [], nextDate: null };
    mockFetch(200, completion('{"items":[{"id":"nope","why":"x"}]}'));
    await expect(explainResults(makeCriteria(), [a])).rejects.toMatchObject({ code: "bad_output" });
  });
  it("sanitizeAiText removes links and markup", () => {
    expect(sanitizeAiText("Va sur <b>https://x.fr</b> vite", 100)).toBe("Va sur vite");
  });
});
