import { describe, expect, it } from "vitest";
import { makeActivity } from "@/test-utils/factory";
import { dedupe, isSameActivity, mergeActivities, normalizeName } from "@/lib/search/dedupe";

const here = { lat: 45.9, lon: 6.13 };
const near = (m: number) => ({ lat: here.lat + m / 111320, lon: here.lon });

describe("normalizeName", () => {
  it("removes accents, punctuation and stop words", () => {
    expect(normalizeName("Le Château de Menthon-Saint-Bernard")).toBe("chateau menthon saint bernard");
  });
});

describe("isSameActivity", () => {
  it("matches the same Wikidata id regardless of distance", () => {
    const a = makeActivity({ wikidataId: "Q42", location: here });
    const b = makeActivity({ wikidataId: "Q42", location: near(250) });
    expect(isSameActivity(a, b)).toBe(true);
  });
  it("matches the same normalised name within 200 m", () => {
    const a = makeActivity({ name: "Château de Montrottier", location: here });
    const b = makeActivity({ name: "Chateau  Montrottier", location: near(120), provider: "osm" });
    expect(isSameActivity(a, b)).toBe(true);
  });
  it("does not match same name far apart", () => {
    expect(isSameActivity(makeActivity({ name: "Musée", location: here }), makeActivity({ name: "Musée", location: near(5000) }))).toBe(false);
  });
  it("never merges a place with an event held there", () => {
    const place = makeActivity({ name: "Auditorium", location: here });
    const event = makeActivity({ name: "Auditorium", kind: "event", location: here, dates: [{ start: "2026-10-20", end: "2026-10-20" }] });
    expect(isSameActivity(place, event)).toBe(false);
  });
  it("keeps two occurrences of the same event on different days apart", () => {
    const a = makeActivity({ name: "Concert", kind: "event", location: here, dates: [{ start: "2026-10-20", end: "2026-10-20" }] });
    const b = makeActivity({ name: "Concert", kind: "event", location: here, dates: [{ start: "2026-11-02", end: "2026-11-02" }] });
    expect(isSameActivity(a, b)).toBe(false);
  });
  it("matches the same website page nearby, but not a bare shared domain", () => {
    const a = makeActivity({ name: "A", website: "https://www.example.fr/lieux/fort", location: here });
    const b = makeActivity({ name: "B", website: "https://example.fr/lieux/fort/", location: near(100) });
    expect(isSameActivity(a, b)).toBe(true);
    const c = makeActivity({ name: "C", website: "https://chaine.fr", location: here });
    const d = makeActivity({ name: "D", website: "https://chaine.fr", location: near(50) });
    expect(isSameActivity(c, d)).toBe(false);
  });
});

describe("merge", () => {
  it("keeps the richest fields and all sources", () => {
    const dt = makeActivity({
      name: "Château",
      location: here,
      price: { kind: "paid", min: 6, max: 10, currency: "EUR", label: null, status: "verified" },
      sources: [{ provider: "datatourisme", providerLabel: "DATAtourisme", url: "https://data.datatourisme.fr/x", attribution: "dt" }],
    });
    const osm = makeActivity({
      name: "Château",
      provider: "osm",
      location: near(30),
      image: { url: "https://upload.wikimedia.org/x.jpg", credit: "A", license: "CC BY-SA 4.0", sourcePage: null },
      wikipediaUrl: "https://fr.wikipedia.org/wiki/X",
      accessibility: { wheelchair: true, status: "indicative" },
      categories: ["heritage"],
      sources: [{ provider: "osm", providerLabel: "OpenStreetMap", url: "https://www.openstreetmap.org/node/1", attribution: "osm" }],
    });
    const m = mergeActivities(dt, osm);
    expect(m.image?.url).toContain("wikimedia");
    expect(m.price.min).toBe(6);
    expect(m.wikipediaUrl).toBeTruthy();
    expect(m.accessibility.wheelchair).toBe(true);
    expect(m.sources.map((s) => s.provider).sort()).toEqual(["datatourisme", "osm"]);
    expect(m.categories).toEqual(expect.arrayContaining(["culture", "heritage"]));
  });

  it("dedupe collapses duplicates across sources and ids", () => {
    const a = makeActivity({ name: "Fort de Côte-Lorette", location: here });
    const b = makeActivity({ name: "Fort de Cote Lorette", location: near(40), provider: "osm" });
    const c = makeActivity({ name: "Piscine", location: near(2000) });
    const out = dedupe([a, b, c, { ...a }]);
    expect(out).toHaveLength(2);
    expect(out[0]!.sources).toHaveLength(2);
  });
});
