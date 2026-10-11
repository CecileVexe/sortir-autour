/**
 * Normalisation tests on REAL payloads captured from the APIs (tests/fixtures, 10/2026),
 * plus hand-made incomplete / malformed payloads.
 */
import { describe, expect, it } from "vitest";
import overpass from "../../../tests/fixtures/overpass-lyon.json";
import dtPlaces from "../../../tests/fixtures/datatourisme-places.json";
import dtEvents from "../../../tests/fixtures/datatourisme-events.json";
import oaEvents from "../../../tests/fixtures/openagenda-events.json";
import { normalizeOsmElement } from "@/lib/providers/osm/normalize";
import { normalizeDtPoi } from "@/lib/providers/datatourisme/normalize";
import { normalizeOaEvent, priceFromConditions } from "@/lib/providers/openagenda/normalize";
import { townName } from "@/lib/providers/openagenda";
import { planPlaceQueries } from "@/lib/providers/datatourisme";
import { buildOverpassQuery } from "@/lib/providers/osm";
import type { Activity } from "@/lib/activity/types";

const T = "2026-10-11T10:00:00.000Z";
const notNull = <T,>(x: T | null): x is T => x !== null;

function expectWellFormed(a: Activity) {
  expect(a.id).toMatch(/^(osm|datatourisme|openagenda):.+/);
  expect(a.name.length).toBeGreaterThan(0);
  expect(Number.isFinite(a.location.lat) && Number.isFinite(a.location.lon)).toBe(true);
  expect(a.categories.length).toBeGreaterThan(0);
  expect(a.sources[0]!.attribution.length).toBeGreaterThan(0);
  expect(a.isDemo).toBe(false);
  if (a.sourceUrl) expect(a.sourceUrl).toMatch(/^https?:\/\//);
  if (a.price.kind === "unknown") {
    expect(a.price.min).toBeNull();
    expect(a.price.status).toBe("unknown");
  }
}

describe("OpenStreetMap", () => {
  const items = overpass.elements.map((e) => normalizeOsmElement(e, T)).filter(notNull);

  it("normalises real Overpass elements", () => {
    expect(items.length).toBeGreaterThanOrEqual(8);
    items.forEach(expectWellFormed);
    expect(items.every((a) => a.sourceUrl?.startsWith("https://www.openstreetmap.org/"))).toBe(true);
  });

  it("classifies by tags and never invents a price, audience or image", () => {
    const bowling = items.find((a) => /bowling/i.test(a.name));
    expect(bowling?.categories).toContain("leisure");
    for (const a of items) {
      expect(a.audience.childrenWelcome).toBeNull();
      expect(a.image).toBeNull(); // images only come from the Wikidata enrichment
    }
  });

  it("maps fee=no to free (indicative) and fee=yes to paid without amount", () => {
    const base = { type: "node", id: 1, lat: 45.7, lon: 4.8 };
    const freeA = normalizeOsmElement({ ...base, tags: { name: "Parc", leisure: "park", fee: "no" } }, T)!;
    expect(freeA.price).toMatchObject({ kind: "free", status: "indicative" });
    const paidA = normalizeOsmElement({ ...base, tags: { name: "Musée", tourism: "museum", fee: "yes" } }, T)!;
    expect(paidA.price).toMatchObject({ kind: "paid", min: null });
    const unknown = normalizeOsmElement({ ...base, tags: { name: "Musée", tourism: "museum" } }, T)!;
    expect(unknown.price.kind).toBe("unknown");
  });

  it("rejects unnamed, unclassified or unlocated elements", () => {
    expect(normalizeOsmElement({ type: "node", id: 2, lat: 45, lon: 4, tags: { tourism: "museum" } }, T)).toBeNull();
    expect(normalizeOsmElement({ type: "node", id: 3, lat: 45, lon: 4, tags: { name: "X", shop: "bakery" } }, T)).toBeNull();
    expect(normalizeOsmElement({ type: "way", id: 4, tags: { name: "X", tourism: "museum" } }, T)).toBeNull();
    expect(normalizeOsmElement({ nonsense: true }, T)).toBeNull();
  });

  it("rejects unsafe website URLs", () => {
    const a = normalizeOsmElement({ type: "node", id: 5, lat: 45, lon: 4, tags: { name: "X", tourism: "museum", website: "javascript:alert(1)" } }, T)!;
    expect(a.website).toBeNull();
  });

  it("builds a bounding-box Overpass query with exact tag clauses", () => {
    const q = buildOverpassQuery(["culture"], 45.758, 4.835, 10);
    expect(q).toContain("[bbox:");
    expect(q).toContain('nwr["tourism"="museum"]["name"]');
    expect(q).not.toContain("around:");
    expect(buildOverpassQuery(["culture"], 45.758, 4.835, 30)).toContain("wikidata|wikipedia|website");
  });
});

describe("DATAtourisme", () => {
  it("normalises real places", () => {
    const items = dtPlaces.objects.map((o) => normalizeDtPoi(o, T, "place")).filter(notNull);
    expect(items.length).toBeGreaterThan(3);
    items.forEach(expectWellFormed);
    expect(items[0]!.sources[0]!.attribution).toMatch(/DATAtourisme — .+Licence Ouverte/);
    expect(items.every((a) => a.image === null)).toBe(true);
  });

  it("normalises real events with dates and verified prices", () => {
    const items = dtEvents.objects.map((o) => normalizeDtPoi(o, T, "event")).filter(notNull);
    expect(items.length).toBeGreaterThan(0);
    items.forEach(expectWellFormed);
    expect(items.every((a) => a.kind === "event" && (a.dates?.length ?? 0) > 0)).toBe(true);
  });

  it("parses prices and keeps unknown when absent", () => {
    const base = {
      uuid: "u1",
      label: { "@fr": "Musée" },
      type: ["Museum", "CulturalSite", "PlaceOfInterest"],
      isLocatedAt: [{ geo: { latitude: 45.9, longitude: 6.1 } }],
    };
    expect(normalizeDtPoi(base, T, "place")!.price.kind).toBe("unknown");
    const priced = normalizeDtPoi({ ...base, offers: [{ priceSpecification: [{ priceCurrency: "EUR", minPrice: [5], maxPrice: [12] }] }] }, T, "place")!;
    expect(priced.price).toMatchObject({ kind: "paid", min: 5, max: 12, status: "verified" });
    const free = normalizeDtPoi({ ...base, offers: [{ priceSpecification: [{ minPrice: [0], maxPrice: [0] }] }] }, T, "place")!;
    expect(free.price.kind).toBe("free");
  });

  it("drops lodging and events without dates", () => {
    const hotel = { uuid: "h", label: { "@fr": "Hôtel" }, type: ["Hotel", "Accommodation"], isLocatedAt: [{ geo: { latitude: 45, longitude: 6 } }] };
    expect(normalizeDtPoi(hotel, T, "place")).toBeNull();
    const ev = { uuid: "e", label: { "@fr": "Concert" }, type: ["Concert", "EntertainmentAndEvent"], isLocatedAt: [{ geo: { latitude: 45, longitude: 6 } }] };
    expect(normalizeDtPoi(ev, T, "event")).toBeNull();
  });

  it("plans at most 3 typed place queries", () => {
    expect(planPlaceQueries([]).types).toHaveLength(3);
    expect(planPlaceQueries(["culture", "heritage"]).types).toEqual(["CulturalSite"]);
    expect(planPlaceQueries(["culture", "food", "nature", "sport", "markets"]).types).toHaveLength(3);
    expect(planPlaceQueries(["nature"]).tours).toBe(true);
  });
});

describe("OpenAgenda", () => {
  it("normalises real events (image, canonical link, licence, dates)", () => {
    const items = oaEvents.events.map((e) => normalizeOaEvent(e, T)).filter(notNull);
    expect(items.length).toBe(2);
    items.forEach(expectWellFormed);
    const a = items[0]!;
    expect(a.image?.url).toMatch(/^https:\/\/img\.openagenda\.com\//);
    expect(a.sourceUrl).toMatch(/^https:\/\/openagenda\.com\//);
    expect(a.sources[0]!.attribution).toMatch(/Licence Ouverte/);
    expect(a.categories).toContain("events");
  });

  it("skips cancelled, online-only and unlocated events", () => {
    const base = { uid: 1, title: { fr: "Atelier" }, timings: [{ begin: "2026-10-20T10:00:00+02:00", end: "2026-10-20T12:00:00+02:00" }], location: { latitude: 45.7, longitude: 4.8 } };
    expect(normalizeOaEvent(base, T)).not.toBeNull();
    expect(normalizeOaEvent({ ...base, status: 6 }, T)).toBeNull();
    expect(normalizeOaEvent({ ...base, attendanceMode: 2 }, T)).toBeNull();
    expect(normalizeOaEvent({ ...base, location: null }, T)).toBeNull();
    expect(normalizeOaEvent({ ...base, timings: [] }, T)).toBeNull();
  });

  it("reads prices from free-text conditions without inventing", () => {
    expect(priceFromConditions("Entrée libre")).toMatchObject({ kind: "free", status: "indicative" });
    expect(priceFromConditions("Plein tarif 12 €, réduit 8 €")).toMatchObject({ kind: "paid", min: 8, max: 12 });
    expect(priceFromConditions("Gratuit pour les moins de 12 ans, 6 € sinon")).toMatchObject({ kind: "paid", min: 0, max: 6 });
    expect(priceFromConditions("Sur réservation")).toMatchObject({ kind: "unknown", label: "Sur réservation" });
    expect(priceFromConditions(null).kind).toBe("unknown");
  });

  it("derives the town name used to find agendas", () => {
    expect(townName("Lyon 2e Arrondissement", "x")).toBe("Lyon");
    expect(townName(null, "Annecy, 74000")).toBe("Annecy");
    expect(townName("Villeurbanne", "Villeurbanne (ma position)")).toBe("Villeurbanne");
  });
});
