import { beforeEach, describe, expect, it } from "vitest";
import { __resetCacheForTests, createMemoryCache } from "@/lib/cache";
import { AppError } from "@/lib/errors";
import type { ActivityProvider } from "@/lib/providers/types";
import { runSearch } from "@/lib/search/engine";
import { LYON, makeActivity, makeCriteria } from "@/test-utils/factory";

const NOW = new Date("2026-10-14T10:00:00+02:00");

function provider(over: Partial<ActivityProvider> & Pick<ActivityProvider, "id" | "search">): ActivityProvider {
  return {
    label: over.id,
    attribution: `attr ${over.id}`,
    isConfigured: () => true,
    isEnabled: () => true,
    appliesTo: () => true,
    ...over,
  } as ActivityProvider;
}

const near = (km: number) => ({ lat: LYON.lat + km / 111.32, lon: LYON.lon });

beforeEach(() => __resetCacheForTests(createMemoryCache()));

describe("runSearch", () => {
  it("applies the radius to geolocated results (distance computed by the engine)", async () => {
    const p = provider({
      id: "datatourisme",
      search: async () => ({
        activities: [makeActivity({ name: "2 km", location: near(2), distanceKm: null }), makeActivity({ name: "25 km", location: near(25), distanceKm: null })],
        cacheHit: false,
      }),
    });
    const r = await runSearch(makeCriteria({ radiusKm: 10 }), { providers: [p], now: NOW });
    expect(r.items.map((a) => a.name)).toEqual(["2 km"]);
    expect(r.items[0]!.distanceKm).toBeCloseTo(2, 1);
    expect(r.retrieved).toBe(1);
  });

  it("isolates a failing provider and reports it", async () => {
    const ok = provider({ id: "datatourisme", search: async () => ({ activities: [makeActivity({ location: near(1) })], cacheHit: false }) });
    const ko = provider({ id: "openagenda", search: async () => Promise.reject(new AppError("provider_unavailable", "OpenAgenda est indisponible.")) });
    const r = await runSearch(makeCriteria(), { providers: [ok, ko], now: NOW });
    expect(r.items).toHaveLength(1);
    expect(r.providers.find((p) => p.id === "openagenda")).toMatchObject({ status: "error", message: "OpenAgenda est indisponible." });
  });

  it("throws a clear error when every source fails", async () => {
    const ko = provider({ id: "datatourisme", search: async () => Promise.reject(new Error("boom")) });
    await expect(runSearch(makeCriteria(), { providers: [ko], now: NOW })).rejects.toMatchObject({ code: "provider_unavailable" });
  });

  it("reports unconfigured and disabled providers without calling them", async () => {
    let called = false;
    const noKey = provider({ id: "openagenda", isConfigured: () => false, search: async () => ((called = true), { activities: [], cacheHit: false }) });
    const off = provider({ id: "osm", isEnabled: () => false, search: async () => ((called = true), { activities: [], cacheHit: false }) });
    const ok = provider({ id: "datatourisme", search: async () => ({ activities: [makeActivity({ location: near(1) })], cacheHit: false }) });
    const r = await runSearch(makeCriteria(), { providers: [noKey, off, ok], now: NOW });
    expect(called).toBe(false);
    expect(r.providers.map((p) => `${p.id}:${p.status}`)).toEqual(expect.arrayContaining(["openagenda:not_configured", "osm:disabled", "datatourisme:ok"]));
  });

  it("fast phase only peeks at slow providers; full phase runs them", async () => {
    let searched = 0;
    const slow = provider({
      id: "osm",
      slow: true,
      peek: async () => null,
      search: async () => ((searched += 1), { activities: [makeActivity({ name: "OSM", location: near(1), provider: "osm" })], cacheHit: false }),
    });
    const fast = provider({ id: "datatourisme", search: async () => ({ activities: [makeActivity({ name: "DT", location: near(3) })], cacheHit: false }) });
    const r1 = await runSearch(makeCriteria(), { providers: [slow, fast], now: NOW, phase: "fast" });
    expect(searched).toBe(0);
    expect(r1.pending).toBe(true);
    expect(r1.providers.find((p) => p.id === "osm")!.status).toBe("pending");
    const r2 = await runSearch(makeCriteria(), { providers: [slow, fast], now: NOW, phase: "full" });
    expect(searched).toBe(1);
    expect(r2.pending).toBe(false);
    expect(r2.items.map((a) => a.name).sort()).toEqual(["DT", "OSM"]);
  });

  it("paginates and distinguishes displayed vs matched counts", async () => {
    const many = Array.from({ length: 40 }, (_, i) => makeActivity({ name: `A${i}`, location: near(1 + i * 0.1) }));
    const p = provider({ id: "datatourisme", search: async () => ({ activities: many, cacheHit: false }) });
    const r = await runSearch(makeCriteria(), { providers: [p], now: NOW, pageSize: 18 });
    expect(r.items).toHaveLength(18);
    expect(r.matched).toBe(40);
    expect(r.hasMore).toBe(true);
    const r3 = await runSearch(makeCriteria(), { providers: [p], now: NOW, pageSize: 18, page: 3 });
    expect(r3.items).toHaveLength(4);
    expect(r3.hasMore).toBe(false);
  });

  it("removes duplicates coming from two providers", async () => {
    const a = provider({ id: "datatourisme", search: async () => ({ activities: [makeActivity({ name: "Fort de Feyzin", location: near(2) })], cacheHit: false }) });
    const b = provider({ id: "osm", search: async () => ({ activities: [makeActivity({ name: "Fort de Feyzin", location: near(2.05), provider: "osm" })], cacheHit: false }) });
    const r = await runSearch(makeCriteria(), { providers: [a, b], now: NOW });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.sources).toHaveLength(2);
  });

  it("times out a provider that hangs", async () => {
    const hang = provider({ id: "openagenda", timeoutMs: 50, search: () => new Promise(() => {}) });
    const ok = provider({ id: "datatourisme", search: async () => ({ activities: [makeActivity({ location: near(1) })], cacheHit: false }) });
    const r = await runSearch(makeCriteria(), { providers: [hang, ok], now: NOW });
    expect(r.providers.find((p) => p.id === "openagenda")!.status).toBe("error");
  });
});
