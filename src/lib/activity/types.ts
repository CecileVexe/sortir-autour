import type { CategoryId, Environment } from "@/config/categories";

export type ProviderId = "datatourisme" | "osm" | "openagenda" | "demo";

/**
 * How trustworthy a piece of information is:
 *  - verified: stated explicitly by the source,
 *  - indicative: stated by the source but likely to change, or deduced from a structured tag,
 *  - unknown: not provided.
 */
export type InfoStatus = "verified" | "indicative" | "unknown";

export interface ActivityImage {
  url: string;
  /** Author / credit line, when known. */
  credit: string | null;
  /** Licence short name (e.g. "CC BY-SA 4.0"), when known. */
  license: string | null;
  /** Page describing the image (e.g. Commons file page). */
  sourcePage: string | null;
}

export interface ActivityPrice {
  kind: "free" | "paid" | "unknown";
  /** Per-person amounts in `currency`, when known. */
  min: number | null;
  max: number | null;
  currency: "EUR" | null;
  /** Free text from the source (e.g. "Tarif réduit : 8 €"), when available. */
  label: string | null;
  status: InfoStatus;
}

export interface ActivityDateRange {
  /** ISO date or datetime. */
  start: string;
  end: string;
}

export interface ActivitySourceRef {
  provider: ProviderId;
  providerLabel: string;
  url: string | null;
  /** Licence / attribution text required by the source. */
  attribution: string;
}

export interface Activity {
  /** Stable internal id: `${provider}:${sourceId}`. */
  id: string;
  kind: "place" | "event";
  name: string;
  description: string | null;
  image: ActivityImage | null;
  /** Primary link to the original source (opened in a new tab). */
  sourceUrl: string | null;
  /** Official website of the venue / organiser, when known. */
  website: string | null;
  wikipediaUrl: string | null;
  wikidataId: string | null;
  provider: ProviderId;
  providerLabel: string;
  /** All sources merged into this activity (after de-duplication). */
  sources: ActivitySourceRef[];
  address: string | null;
  city: string | null;
  location: { lat: number; lon: number };
  /** Great-circle distance from the search origin, km. Set by the engine. */
  distanceKm: number | null;
  categories: CategoryId[];
  price: ActivityPrice;
  environment: { value: Environment; inferred: boolean };
  audience: {
    /** True only when the source explicitly says so. */
    childrenWelcome: boolean | null;
    ageMin: number | null;
    ageMax: number | null;
    status: InfoStatus;
  };
  accessibility: { wheelchair: boolean | null; status: InfoStatus };
  /** Event occurrences (events only). */
  dates: ActivityDateRange[] | null;
  /** Raw opening hours text from the source. Never interpreted as "open now". */
  openingHours: string | null;
  infoStatus: InfoStatus;
  /** When we fetched it. */
  fetchedAt: string;
  /** When the source last updated it, if known. */
  updatedAt: string | null;
  /** True for demo/fixture data — must never be shown as real. */
  isDemo: boolean;
  /** Notability hint (e.g. has a Wikipedia article). 0..1 */
  notability: number;
}

export interface RankedActivity extends Activity {
  score: number;
  /** Short French reasons explaining the match (deterministic). */
  reasons: string[];
  /** Criteria that could not be verified for this activity. */
  unverified: string[];
  /** Next occurrence within the requested window (events only). */
  nextDate: ActivityDateRange | null;
}

export function unknownPrice(): ActivityPrice {
  return { kind: "unknown", min: null, max: null, currency: null, label: null, status: "unknown" };
}
