import { describe, expect, it } from "vitest";
import { makeActivity, makeCriteria } from "@/test-utils/factory";
import { diversify, matchesCategories, rankActivities, sortRanked, textMatchScore } from "@/lib/search/ranking";
import { dateWindow } from "@/lib/search/dates";

const NOW = new Date("2026-10-14T10:00:00+02:00"); // a Wednesday
const free = { kind: "free" as const, min: 0, max: 0, currency: "EUR" as const, label: null, status: "verified" as const };
const paid = (min: number, max = min) => ({ kind: "paid" as const, min, max, currency: "EUR" as const, label: null, status: "verified" as const });

function rank(items: ReturnType<typeof makeActivity>[], over: Parameters<typeof makeCriteria>[0] = {}) {
  const c = makeCriteria(over);
  return rankActivities(items, c, dateWindow(c, NOW));
}

describe("budget filter", () => {
  it("'Gratuit' keeps only known-free activities and counts unknown prices as hidden", () => {
    const items = [makeActivity({ name: "Libre", price: free }), makeActivity({ name: "Payant", price: paid(8) }), makeActivity({ name: "Inconnu" })];
    const { ranked, stats } = rank(items, { budget: { preset: "free" } });
    expect(ranked.map((a) => a.name)).toEqual(["Libre"]);
    expect(stats.unknownPriceHidden).toBe(1);
  });
  it("a ceiling excludes known prices above it but keeps unknown prices (flagged)", () => {
    const items = [makeActivity({ name: "8€", price: paid(8) }), makeActivity({ name: "30€", price: paid(30) }), makeActivity({ name: "Inconnu" })];
    const { ranked } = rank(items, { budget: { preset: "lt10" } });
    expect(ranked.map((a) => a.name).sort()).toEqual(["8€", "Inconnu"]);
    expect(ranked.find((a) => a.name === "Inconnu")!.unverified).toContain("Prix non renseigné");
  });
  it("a group budget is divided by the number of people", () => {
    const items = [makeActivity({ name: "12€", price: paid(12) }), makeActivity({ name: "30€", price: paid(30) })];
    const { ranked } = rank(items, { budget: { preset: "custom", customMax: 60, scope: "group", groupSize: 4 } });
    expect(ranked.map((a) => a.name)).toEqual(["12€"]);
  });
  it("uses the minimum price of a range", () => {
    const { ranked } = rank([makeActivity({ price: paid(5, 40) })], { budget: { preset: "lt10" } });
    expect(ranked).toHaveLength(1);
  });
});

describe("category filter", () => {
  it("keeps activities sharing a selected category", () => {
    const items = [makeActivity({ name: "Musée", categories: ["culture"] }), makeActivity({ name: "Parc", categories: ["parks"] })];
    expect(rank(items, { categories: ["parks"] }).ranked.map((a) => a.name)).toEqual(["Parc"]);
  });
  it("'events' matches any event; 'family' matches family-oriented categories", () => {
    const ev = makeActivity({ kind: "event", categories: ["culture"], dates: [{ start: "2026-10-15", end: "2026-10-15" }] });
    const zoo = makeActivity({ categories: ["animals"] });
    expect(matchesCategories(ev, ["events"])).toBe(true);
    expect(matchesCategories(zoo, ["family"])).toBe(true);
    expect(matchesCategories(zoo, ["culture"])).toBe(false);
  });
  it("no category selected = open to everything", () => {
    expect(rank([makeActivity({ categories: ["sport"] })]).ranked).toHaveLength(1);
  });
});

describe("other hard filters", () => {
  it("indoor excludes outdoor activities but keeps unknown ones (flagged)", () => {
    const items = [
      makeActivity({ name: "Dedans", environment: { value: "indoor", inferred: false } }),
      makeActivity({ name: "Dehors", environment: { value: "outdoor", inferred: true } }),
      makeActivity({ name: "?", environment: { value: "unknown", inferred: false }, categories: [] }),
    ];
    const { ranked, stats } = rank(items, { environment: "indoor" });
    expect(ranked.map((a) => a.name).sort()).toEqual(["?", "Dedans"]);
    expect(stats.environmentUnknown).toBe(1);
  });
  it("PMR excludes places declared inaccessible and ranks accessible ones first", () => {
    const items = [
      makeActivity({ name: "Non", accessibility: { wheelchair: false, status: "verified" } }),
      makeActivity({ name: "Inconnu", accessibility: { wheelchair: null, status: "unknown" }, distanceKm: 0.5 }),
      makeActivity({ name: "Oui", accessibility: { wheelchair: true, status: "verified" }, distanceKm: 5 }),
    ];
    const { ranked } = rank(items, { accessibleOnly: true, sort: "relevance" });
    expect(ranked.map((a) => a.name)).toEqual(["Oui", "Inconnu"]);
  });
  it("with children, nightlife-only places and 12+ events are excluded", () => {
    const items = [
      makeActivity({ name: "Club", categories: ["nightlife"] }),
      makeActivity({ name: "Ados", kind: "event", dates: [{ start: "2026-10-15", end: "2026-10-15" }], audience: { childrenWelcome: false, ageMin: 14, ageMax: null, status: "verified" } }),
      makeActivity({ name: "Zoo", categories: ["animals"] }),
    ];
    expect(rank(items, { companions: ["family"] }).ranked.map((a) => a.name)).toEqual(["Zoo"]);
  });
  it("events must occur in the requested window; places are kept but flagged", () => {
    const items = [
      makeActivity({ name: "Samedi", kind: "event", dates: [{ start: "2026-10-17T14:00:00+02:00", end: "2026-10-17T18:00:00+02:00" }] }),
      makeActivity({ name: "Mardi prochain", kind: "event", dates: [{ start: "2026-10-20", end: "2026-10-20" }] }),
      makeActivity({ name: "Musée" }),
    ];
    const { ranked, stats } = rank(items, { when: { kind: "weekend" } });
    expect(ranked.map((a) => a.name).sort()).toEqual(["Musée", "Samedi"]);
    expect(stats.placesWithoutDates).toBe(1);
    expect(ranked.find((a) => a.name === "Samedi")!.nextDate?.start).toContain("2026-10-17");
  });
  it("eventType filters places vs events", () => {
    const items = [makeActivity({ name: "Lieu" }), makeActivity({ name: "Événement", kind: "event", dates: [{ start: "2026-10-15", end: "2026-10-15" }] })];
    expect(rank(items, { eventType: "permanent" }).ranked.map((a) => a.name)).toEqual(["Lieu"]);
    expect(rank(items, { eventType: "events" }).ranked.map((a) => a.name)).toEqual(["Événement"]);
  });
});

describe("free-text query", () => {
  it("keeps matching activities when some match", () => {
    const items = [makeActivity({ name: "Château de Lumagne" }), makeActivity({ name: "Piscine" })];
    const { ranked, stats } = rank(items, { query: "chateau" });
    expect(ranked.map((a) => a.name)).toEqual(["Château de Lumagne"]);
    expect(stats.queryIgnored).toBe(false);
  });
  it("is ignored (and reported) when nothing matches", () => {
    const { ranked, stats } = rank([makeActivity({ name: "Piscine" })], { query: "volcan" });
    expect(ranked).toHaveLength(1);
    expect(stats.queryIgnored).toBe(true);
  });
  it("scores accents-insensitively", () => {
    expect(textMatchScore(makeActivity({ name: "Musée des Beaux-Arts" }), "musee")).toBeGreaterThan(0);
  });
});

describe("scoring and sorting", () => {
  it("closer activities score higher, everything else equal", () => {
    const { ranked } = rank([makeActivity({ name: "Loin", distanceKm: 18 }), makeActivity({ name: "Près", distanceKm: 1 })]);
    expect(ranked[0]!.name).toBe("Près");
  });
  it("demo activities always rank after real ones", () => {
    const { ranked } = rank([makeActivity({ name: "Démo", isDemo: true, distanceKm: 0.1 }), makeActivity({ name: "Réel", distanceKm: 15 })]);
    expect(ranked.map((a) => a.name)).toEqual(["Réel", "Démo"]);
  });
  it("price sort puts known prices first (ascending) and unknown last", () => {
    const { ranked } = rank([makeActivity({ name: "?" }), makeActivity({ name: "20", price: paid(20) }), makeActivity({ name: "0", price: free })], { sort: "price" });
    expect(ranked.map((a) => a.name)).toEqual(["0", "20", "?"]);
  });
  it("distance sort orders by distance", () => {
    const { ranked } = rank([makeActivity({ name: "b", distanceKm: 4 }), makeActivity({ name: "a", distanceKm: 2 })], { sort: "distance" });
    expect(ranked.map((a) => a.name)).toEqual(["a", "b"]);
  });
  it("explains matches with deterministic reasons", () => {
    const { ranked } = rank([makeActivity({ price: free, categories: ["parks"] })], { categories: ["parks"] });
    expect(ranked[0]!.reasons.join(" ")).toMatch(/vol d'oiseau/);
    expect(ranked[0]!.reasons).toContain("Gratuit");
  });
  it("diversify avoids long runs of the same kind/category", () => {
    const base = Array.from({ length: 4 }, (_, i) =>
      ({ ...makeActivity({ categories: ["culture"] }), score: 50 - i * 0.5, reasons: [], unverified: [], nextDate: null }),
    );
    const other = { ...makeActivity({ categories: ["parks"], provider: "osm" }), score: 47, reasons: [], unverified: [], nextDate: null };
    const out = diversify([...base, other]);
    expect(out.findIndex((a) => a.id === other.id)).toBeLessThan(4);
    expect(sortRanked([...base, other], "relevance")).toHaveLength(5);
  });
});
