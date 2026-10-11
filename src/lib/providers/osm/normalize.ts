import { z } from "zod";
import { categoriesFromOsmTags } from "@/config/categories";
import { unknownPrice, type Activity, type ActivityPrice } from "@/lib/activity/types";
import { inferEnvironment, joinAddress, overallStatus, parseEuroAmount, shortDescription } from "@/lib/activity/normalize";
import { isValidLatLon } from "@/lib/geo/distance";
import { safeExternalUrl } from "@/lib/security/url";

export const OSM_ATTRIBUTION = "© contributeurs OpenStreetMap (ODbL)";
export const OSM_LABEL = "OpenStreetMap";

export const osmElementSchema = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number().int(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string(), z.string()).default({}),
});
export type OsmElement = z.infer<typeof osmElementSchema>;

function osmPrice(tags: Record<string, string>): ActivityPrice {
  const fee = tags.fee?.toLowerCase();
  if (fee === "no") return { kind: "free", min: 0, max: 0, currency: "EUR", label: null, status: "indicative" };
  if (fee === "yes" || tags.charge) {
    const amount = parseEuroAmount(tags.charge);
    return {
      kind: "paid",
      min: amount,
      max: amount,
      currency: amount !== null ? "EUR" : null,
      label: tags.charge ?? null,
      status: "indicative",
    };
  }
  return unknownPrice();
}

function wikipediaUrl(tag: string | undefined): string | null {
  if (!tag) return null;
  const m = /^([a-z]{2,3}):(.+)$/.exec(tag);
  if (!m) return null;
  return safeExternalUrl(`https://${m[1]}.wikipedia.org/wiki/${encodeURIComponent(m[2]!.replace(/ /g, "_"))}`);
}

export function normalizeOsmElement(raw: unknown, fetchedAt: string): Activity | null {
  const parsed = osmElementSchema.safeParse(raw);
  if (!parsed.success) return null;
  const el = parsed.data;
  const tags = el.tags;
  const name = tags["name:fr"] ?? tags.name;
  if (!name) return null;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!isValidLatLon({ lat, lon })) return null;

  const categories = categoriesFromOsmTags(tags);
  if (categories.length === 0) return null;

  const wheelchair = tags.wheelchair === "yes" ? true : tags.wheelchair === "no" ? false : null;
  const price = osmPrice(tags);
  const wikidataId = tags.wikidata && /^Q\d+$/.test(tags.wikidata) ? tags.wikidata : null;
  const wiki = wikipediaUrl(tags.wikipedia);
  const website = safeExternalUrl(tags.website ?? tags["contact:website"] ?? tags.url);
  const sourceUrl = `https://www.openstreetmap.org/${el.type}/${el.id}`;

  let notability = 0;
  if (wikidataId) notability += 0.4;
  if (wiki) notability += 0.4;
  if (tags.tourism === "attraction" || tags.heritage) notability += 0.2;

  return {
    id: `osm:${el.type[0]}${el.id}`,
    kind: "place",
    name: name.slice(0, 200),
    description: shortDescription(tags["description:fr"] ?? tags.description),
    image: null,
    sourceUrl,
    website,
    wikipediaUrl: wiki,
    wikidataId,
    provider: "osm",
    providerLabel: OSM_LABEL,
    sources: [{ provider: "osm", providerLabel: OSM_LABEL, url: sourceUrl, attribution: OSM_ATTRIBUTION }],
    address: joinAddress(
      [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ") || null,
      [tags["addr:postcode"], tags["addr:city"]].filter(Boolean).join(" ") || null,
    ),
    city: tags["addr:city"] ?? null,
    location: { lat: lat!, lon: lon! },
    distanceKm: null,
    categories,
    price,
    environment: inferEnvironment(categories),
    audience: { childrenWelcome: null, ageMin: null, ageMax: null, status: "unknown" },
    accessibility: { wheelchair, status: wheelchair === null ? "unknown" : "indicative" },
    dates: null,
    openingHours: tags.opening_hours?.slice(0, 200) ?? null,
    infoStatus: overallStatus(["indicative", price.status]),
    fetchedAt,
    updatedAt: null,
    isDemo: false,
    notability: Math.min(1, notability),
  };
}
