/**
 * Route handler tests (Next.js App Router handlers are plain functions: Request → Response).
 * External providers are replaced by an in-memory registry: no network calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetCacheForTests, createMemoryCache } from "@/lib/cache";
import { __resetRateLimitForTests } from "@/lib/ratelimit";
import { LYON, makeActivity } from "@/test-utils/factory";

vi.mock("@/lib/providers/registry", () => ({
  ALL_PROVIDERS: [
    {
      id: "datatourisme",
      label: "DATAtourisme",
      attribution: "test",
      isConfigured: () => true,
      isEnabled: () => true,
      appliesTo: () => true,
      search: async () => ({
        activities: [makeActivity({ name: "Château test", location: { lat: LYON.lat + 0.02, lon: LYON.lon }, categories: ["heritage"] })],
        cacheHit: false,
      }),
    },
  ],
}));

const { POST: searchPOST } = await import("@/app/api/search/route");
const { GET: geocodeGET, POST: geocodePOST } = await import("@/app/api/geocode/route");
const { POST: interpretPOST } = await import("@/app/api/ai/interpret/route");
const { GET: aiStatusGET } = await import("@/app/api/ai/status/route");

const saved = { ...process.env };
beforeEach(() => {
  __resetCacheForTests(createMemoryCache());
  __resetRateLimitForTests();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.AI_PROVIDER = "none";
  delete process.env.GROQ_API_KEY;
});
afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});

const json = (url: string, body: unknown, ip = "9.9.9.9") =>
  new Request(url, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("POST /api/search", () => {
  it("returns ranked results for valid criteria", async () => {
    const res = await searchPOST(json("http://t/api/search", { criteria: { origin: LYON, radiusKm: 10 } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].name).toBe("Château test");
    expect(body.matched).toBe(1);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects invalid criteria with a 400 and a readable message", async () => {
    const res = await searchPOST(json("http://t/api/search", { criteria: { origin: { label: "x", lat: 999, lon: 4 } } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_input");
  });
  it("rejects malformed JSON", async () => {
    const res = await searchPOST(json("http://t/api/search", "{oops"));
    expect(res.status).toBe(400);
  });
  it("rejects oversized payloads with 413", async () => {
    const res = await searchPOST(json("http://t/api/search", { criteria: { origin: LYON }, pad: "x".repeat(20000) }));
    expect(res.status).toBe(413);
  });
  it("rate-limits a client with 429 and Retry-After", async () => {
    process.env.SEARCH_RATE_LIMIT_PER_MIN = "2";
    const body = { criteria: { origin: LYON } };
    await searchPOST(json("http://t/api/search", body, "1.1.1.1"));
    await searchPOST(json("http://t/api/search", body, "1.1.1.1"));
    const res = await searchPOST(json("http://t/api/search", body, "1.1.1.1"));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    const other = await searchPOST(json("http://t/api/search", body, "2.2.2.2"));
    expect(other.status).toBe(200);
  });
});

describe("/api/geocode", () => {
  it("returns no suggestions for too-short queries without calling the API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await geocodeGET(new Request("http://t/api/geocode?q=ly"));
    expect((await res.json()).results).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("normalises Géoplateforme results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          features: [
            { geometry: { coordinates: [4.835, 45.758] }, properties: { label: "Lyon", type: "municipality", city: "Lyon", citycode: "69123", depcode: "69", context: "69, Rhône" } },
            { geometry: { coordinates: [0, 0] }, properties: { label: "Bad" } },
          ],
        }),
      ),
    );
    const res = await geocodeGET(new Request("http://t/api/geocode?q=lyon"));
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({ label: "Lyon", lat: 45.758, lon: 4.835, citycode: "69123", department: "69" });
  });
  it("reverse geocoding uses POST and keeps the rounded user position", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ features: [{ geometry: { coordinates: [4.8351, 45.7642] }, properties: { label: "15 Rue X 69002 Lyon", city: "Lyon", type: "housenumber" } }] })),
    );
    const res = await geocodePOST(json("http://t/api/geocode", { lat: 45.764, lon: 4.835 }));
    const body = await res.json();
    expect(body.results[0]).toMatchObject({ label: "Lyon (ma position)", lat: 45.764, lon: 4.835 });
  });
  it("maps upstream outages to a 502 with a French message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const res = await geocodeGET(new Request("http://t/api/geocode?q=marseille"));
    expect(res.status).toBe(502);
    expect((await res.json()).error.message).toMatch(/géocodage/);
  });
});

describe("AI routes", () => {
  it("status reports AI disabled without exposing anything sensitive", async () => {
    const body = await (await aiStatusGET()).json();
    expect(body).toEqual({ enabled: false, provider: null, maxInputChars: 500 });
  });
  it("interpret returns not_configured (501) when AI is off", async () => {
    const res = await interpretPOST(json("http://t/api/ai/interpret", { text: "Une sortie au calme" }));
    expect(res.status).toBe(501);
    expect((await res.json()).aiError.code).toBe("not_configured");
  });
  it("interpret surfaces a provider 429 as quota_exceeded with the fallback message", async () => {
    process.env.AI_PROVIDER = "groq";
    process.env.GROQ_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "rate_limit_exceeded" } }), { status: 429 })));
    const res = await interpretPOST(json("http://t/api/ai/interpret", { text: "Une sortie au calme dimanche" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.aiError.code).toBe("quota_exceeded");
    expect(body.aiError.message).toContain("filtres classiques");
  });
  it("interpret validates input length", async () => {
    process.env.AI_PROVIDER = "groq";
    process.env.GROQ_API_KEY = "test-key";
    const res = await interpretPOST(json("http://t/api/ai/interpret", { text: "x".repeat(800) }));
    expect(res.status).toBe(400);
  });
});
