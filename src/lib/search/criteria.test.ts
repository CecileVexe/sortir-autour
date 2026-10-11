import { describe, expect, it } from "vitest";
import { LYON, makeCriteria } from "@/test-utils/factory";
import { budgetCeilingPerPerson, criteriaSchema, decodeCriteria, encodeCriteria } from "@/lib/search/criteria";
import { dateWindow, formatDateRange, occurrencesInWindow } from "@/lib/search/dates";
import { safeExternalUrl } from "@/lib/security/url";
import { categoriesFromDatatourismeTypes, categoriesFromOsmTags, categoriesFromText } from "@/config/categories";

describe("criteria validation", () => {
  it("applies defaults", () => {
    const c = criteriaSchema.parse({ origin: LYON });
    expect(c.radiusKm).toBe(20);
    expect(c.categories).toEqual([]);
    expect(c.budget.preset).toBe("any");
  });
  it("rejects out-of-range or unknown values", () => {
    expect(criteriaSchema.safeParse({ origin: LYON, radiusKm: 1000 }).success).toBe(false);
    expect(criteriaSchema.safeParse({ origin: LYON, categories: ["casino-royal"] }).success).toBe(false);
    expect(criteriaSchema.safeParse({ origin: { ...LYON, lat: 120 } }).success).toBe(false);
    expect(criteriaSchema.safeParse({}).success).toBe(false);
  });
  it("cleans and caps free text", () => {
    const c = criteriaSchema.parse({ origin: LYON, query: "  chât\u0000eau   fort  " });
    expect(c.query).toBe("chât eau fort");
    expect(criteriaSchema.safeParse({ origin: LYON, ideal: "x".repeat(5000) }).success).toBe(false);
  });
  it("round-trips through the URL encoding and rejects tampering", () => {
    const c = makeCriteria({ categories: ["heritage"], query: "château", budget: { preset: "lt10" } });
    expect(decodeCriteria(encodeCriteria(c))).toEqual(c);
    expect(decodeCriteria("not-base64!!")).toBeNull();
    expect(decodeCriteria(encodeCriteria(c).slice(0, 20))).toBeNull();
    expect(decodeCriteria("a".repeat(5000))).toBeNull();
  });
  it("computes the per-person budget ceiling", () => {
    expect(budgetCeilingPerPerson(makeCriteria({ budget: { preset: "10-25" } }))).toBe(25);
    expect(budgetCeilingPerPerson(makeCriteria({ budget: { preset: "custom", customMax: 100, scope: "group", groupSize: 4 } }))).toBe(25);
    expect(budgetCeilingPerPerson(makeCriteria({ budget: { preset: "any" } }))).toBeNull();
  });
});

describe("date windows (Europe/Paris)", () => {
  const wed = new Date("2026-10-14T10:00:00+02:00");
  it("today / weekend / specific date / default horizon", () => {
    expect(dateWindow({ when: { kind: "today", date: null } }, wed)).toMatchObject({ from: "2026-10-14", to: "2026-10-14", explicit: true });
    expect(dateWindow({ when: { kind: "weekend", date: null } }, wed)).toMatchObject({ from: "2026-10-17", to: "2026-10-18" });
    expect(dateWindow({ when: { kind: "weekend", date: null } }, new Date("2026-10-18T09:00:00+02:00"))).toMatchObject({ from: "2026-10-18", to: "2026-10-18" });
    expect(dateWindow({ when: { kind: "date", date: "2026-11-01" } }, wed)).toMatchObject({ from: "2026-11-01", to: "2026-11-01" });
    expect(dateWindow({ when: { kind: "any", date: null } }, wed)).toMatchObject({ from: "2026-10-14", to: "2026-11-13", explicit: false });
  });
  it("past dates fall back to today", () => {
    expect(dateWindow({ when: { kind: "date", date: "2020-01-01" } }, wed).from).toBe("2026-10-14");
  });
  it("finds occurrences overlapping the window", () => {
    const w = { from: "2026-10-17", to: "2026-10-18", explicit: true };
    const occ = occurrencesInWindow(
      [
        { start: "2026-10-10", end: "2026-10-12" },
        { start: "2026-10-16", end: "2026-10-19" },
        { start: "2026-10-18T20:00:00+02:00", end: "2026-10-18T23:00:00+02:00" },
      ],
      w,
    );
    expect(occ).toHaveLength(2);
  });
  it("formats ranges in French", () => {
    expect(formatDateRange({ start: "2026-10-17T14:00:00+02:00", end: "2026-10-17T18:00:00+02:00" })).toBe("sam. 17 oct., 14:00");
    expect(formatDateRange({ start: "2026-05-02", end: "2026-11-02" })).toMatch(/^du .+ au .+/);
  });
});

describe("URL safety", () => {
  it("accepts http(s) public URLs only", () => {
    expect(safeExternalUrl("https://www.chateau-de-menthon.com/")).toBe("https://www.chateau-de-menthon.com/");
    expect(safeExternalUrl("www.lac-annecy.com")).toBe("https://www.lac-annecy.com/");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://x.fr", "http://localhost:3000", "http://192.168.1.1", "https://user:pw@x.fr", "", null, 42]) {
      expect(safeExternalUrl(bad)).toBeNull();
    }
  });
});

describe("category mapping", () => {
  it("maps OSM tags, DATAtourisme classes and keywords", () => {
    expect(categoriesFromOsmTags({ tourism: "museum" })).toEqual(["culture"]);
    expect(categoriesFromOsmTags({ amenity: "restaurant" })).toEqual([]);
    expect(categoriesFromDatatourismeTypes(["Castle", "PlaceOfInterest"])).toEqual(["heritage"]);
    expect(categoriesFromDatatourismeTypes(["SportsAndLeisurePlace"])).toEqual([]); // broad parent class: no category on its own
    expect(categoriesFromText("Grand marché de Noël et brocante")).toContain("markets");
    expect(categoriesFromText("Barber Shop Chronicles")).not.toContain("nightlife");
  });
});
