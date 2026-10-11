/**
 * Geocoding via the IGN Géoplateforme (successor of api-adresse.data.gouv.fr).
 * Free, no key, 50 req/s per IP, autocomplete allowed. Licence Ouverte (Etalab).
 * Docs: https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/geocodage/
 */
import { z } from "zod";
import { cacheKey, cached, TTL } from "@/lib/cache";
import { fetchJson } from "@/lib/http";
import { isValidLatLon } from "@/lib/geo/distance";
import type { Origin } from "@/lib/search/criteria";

const BASE = "https://data.geopf.fr/geocodage";
const LABEL = "Le service de géocodage de l'IGN";

const featureSchema = z.object({
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z
    .object({
      label: z.string(),
      type: z.string().optional(),
      city: z.string().optional(),
      citycode: z.string().optional(),
      postcode: z.string().optional(),
      context: z.string().optional(),
      depcode: z.string().optional(),
    })
    .loose(),
});

const collectionSchema = z.object({ features: z.array(z.unknown()).default([]) });

export interface GeocodeSuggestion extends Origin {
  kind: "municipality" | "street" | "address" | "locality" | "other";
  context: string | null;
}

function toSuggestion(raw: unknown): GeocodeSuggestion | null {
  const f = featureSchema.safeParse(raw);
  if (!f.success) return null;
  const [lon, lat] = f.data.geometry.coordinates;
  if (!isValidLatLon({ lat, lon })) return null;
  const p = f.data.properties;
  const kind =
    p.type === "municipality" ? "municipality" : p.type === "street" ? "street" : p.type === "housenumber" ? "address" : p.type === "locality" ? "locality" : "other";
  const department = p.depcode ?? p.context?.split(",")[0]?.trim() ?? null;
  return {
    label: p.label.slice(0, 160),
    lat,
    lon,
    city: p.city ?? null,
    citycode: p.citycode && /^[0-9AB]{5}$/.test(p.citycode) ? p.citycode : null,
    department: department && /^[0-9AB]{2,3}$/.test(department) ? department : null,
    kind,
    context: p.context ?? null,
  };
}

function parseCollection(json: unknown): GeocodeSuggestion[] {
  const c = collectionSchema.safeParse(json);
  if (!c.success) return [];
  const seen = new Set<string>();
  const out: GeocodeSuggestion[] = [];
  for (const raw of c.data.features) {
    const s = toSuggestion(raw);
    if (!s || seen.has(s.label)) continue;
    seen.add(s.label);
    out.push(s);
  }
  return out;
}

export async function searchPlaces(query: string, limit = 6): Promise<GeocodeSuggestion[]> {
  const q = query.trim().slice(0, 120);
  if (q.length < 3) return [];
  const url = `${BASE}/search?${new URLSearchParams({ q, limit: String(limit), autocomplete: "1" })}`;
  const { value } = await cached(cacheKey("geo", "s", q.toLowerCase(), limit), TTL.geocode, async () =>
    parseCollection(await fetchJson(url, { label: LABEL, timeoutMs: 5000 })),
  );
  return value;
}

export async function reverseGeocode(lat: number, lon: number): Promise<GeocodeSuggestion | null> {
  if (!isValidLatLon({ lat, lon })) return null;
  // Round to ~100 m: enough to name the place, avoids caching precise positions.
  const rl = Number(lat.toFixed(3));
  const ro = Number(lon.toFixed(3));
  const url = `${BASE}/reverse?${new URLSearchParams({ lat: String(rl), lon: String(ro), limit: "1" })}`;
  const { value } = await cached(cacheKey("geo", "r", rl, ro), TTL.geocode, async () =>
    parseCollection(await fetchJson(url, { label: LABEL, timeoutMs: 5000 })),
  );
  const first = value[0];
  if (!first) return null;
  // Show the town rather than a street address, but keep the user's actual position.
  return { ...first, label: first.city ? `${first.city} (ma position)` : first.label, lat, lon };
}
