/** Test-only builders (fictitious data, never used by the app). */
import type { Activity } from "@/lib/activity/types";
import { criteriaSchema, type SearchCriteria, type SearchCriteriaInput } from "@/lib/search/criteria";

export const LYON = { label: "Lyon", lat: 45.758, lon: 4.835, city: "Lyon", citycode: "69123", department: "69" };

let n = 0;
export function makeActivity(over: Partial<Activity> = {}): Activity {
  n += 1;
  return {
    id: `demo:t${n}`,
    kind: "place",
    name: `Activité test ${n}`,
    description: null,
    image: null,
    sourceUrl: `https://example.org/a/${n}`,
    website: null,
    wikipediaUrl: null,
    wikidataId: null,
    provider: "datatourisme",
    providerLabel: "DATAtourisme",
    sources: [{ provider: "datatourisme", providerLabel: "DATAtourisme", url: `https://example.org/a/${n}`, attribution: "test" }],
    address: null,
    city: "Lyon",
    location: { lat: LYON.lat + 0.01, lon: LYON.lon },
    distanceKm: 1.1,
    categories: ["culture"],
    price: { kind: "unknown", min: null, max: null, currency: null, label: null, status: "unknown" },
    environment: { value: "indoor", inferred: true },
    audience: { childrenWelcome: null, ageMin: null, ageMax: null, status: "unknown" },
    accessibility: { wheelchair: null, status: "unknown" },
    dates: null,
    openingHours: null,
    infoStatus: "indicative",
    fetchedAt: "2026-10-11T10:00:00.000Z",
    updatedAt: null,
    isDemo: false,
    notability: 0.3,
    ...over,
  };
}

export function makeCriteria(over: Partial<SearchCriteriaInput> = {}): SearchCriteria {
  return criteriaSchema.parse({ origin: LYON, radiusKm: 20, ...over });
}
