import { describe, expect, it } from "vitest";
import { boundingBox, filterByRadius, formatDistance, gridKey, haversineKm, isValidLatLon } from "@/lib/geo/distance";

const PARIS = { lat: 48.8566, lon: 2.3522 };
const LYON = { lat: 45.764, lon: 4.8357 };

describe("haversineKm", () => {
  it("computes the Paris–Lyon great-circle distance (~392 km)", () => {
    expect(haversineKm(PARIS, LYON)).toBeGreaterThan(388);
    expect(haversineKm(PARIS, LYON)).toBeLessThan(396);
  });
  it("is zero for the same point and symmetric", () => {
    expect(haversineKm(LYON, LYON)).toBe(0);
    expect(haversineKm(PARIS, LYON)).toBeCloseTo(haversineKm(LYON, PARIS), 9);
  });
  it("handles ~1 km offsets", () => {
    expect(haversineKm(LYON, { lat: LYON.lat + 0.009, lon: LYON.lon })).toBeCloseTo(1, 1);
  });
});

describe("boundingBox", () => {
  it("contains the whole circle", () => {
    const bb = boundingBox(LYON, 10);
    for (const bearing of [0, 90, 180, 270]) {
      const rad = (bearing * Math.PI) / 180;
      const p = { lat: LYON.lat + (Math.cos(rad) * 9.9) / 111.32, lon: LYON.lon + (Math.sin(rad) * 9.9) / (111.32 * Math.cos((LYON.lat * Math.PI) / 180)) };
      expect(p.lat).toBeGreaterThanOrEqual(bb.south);
      expect(p.lat).toBeLessThanOrEqual(bb.north);
      expect(p.lon).toBeGreaterThanOrEqual(bb.west);
      expect(p.lon).toBeLessThanOrEqual(bb.east);
    }
  });
});

describe("filterByRadius", () => {
  const items = [
    { id: "near", location: { lat: LYON.lat + 0.02, lon: LYON.lon }, distanceKm: null },
    { id: "edge", location: { lat: LYON.lat + 0.089, lon: LYON.lon }, distanceKm: null }, // ~9.9 km
    { id: "far", location: { lat: LYON.lat + 0.2, lon: LYON.lon }, distanceKm: null },
    { id: "invalid", location: { lat: Number.NaN, lon: 2 }, distanceKm: null },
    { id: "null-island", location: { lat: 0, lon: 0 }, distanceKm: null },
  ];
  it("keeps only items within the radius and annotates their distance", () => {
    const out = filterByRadius(items, LYON, 10);
    expect(out.map((i) => i.id)).toEqual(["near", "edge"]);
    expect(out[0]!.distanceKm).toBeCloseTo(2.2, 1);
  });
  it("does not mutate the input", () => {
    filterByRadius(items, LYON, 10);
    expect(items[0]!.distanceKm).toBeNull();
  });
});

describe("helpers", () => {
  it("validates coordinates", () => {
    expect(isValidLatLon({ lat: 45, lon: 4 })).toBe(true);
    expect(isValidLatLon({ lat: 95, lon: 4 })).toBe(false);
    expect(isValidLatLon({ lat: 0, lon: 0 })).toBe(false);
    expect(isValidLatLon(null)).toBe(false);
  });
  it("formats distances in French", () => {
    expect(formatDistance(0.23)).toBe("250 m");
    expect(formatDistance(3.456)).toBe("3,5 km");
    expect(formatDistance(42.6)).toBe("43 km");
  });
  it("builds grid keys shared by nearby points", () => {
    expect(gridKey({ lat: 45.7581, lon: 4.8312 })).toBe(gridKey({ lat: 45.7584, lon: 4.8318 }));
  });
});
