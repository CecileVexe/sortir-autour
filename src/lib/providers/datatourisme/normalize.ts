import { z } from "zod";
import { categoriesFromDatatourismeTypes } from "@/config/categories";
import { inferEnvironment, joinAddress, overallStatus, shortDescription } from "@/lib/activity/normalize";
import { unknownPrice, type Activity, type ActivityDateRange, type ActivityPrice } from "@/lib/activity/types";
import { isValidLatLon } from "@/lib/geo/distance";
import { safeExternalUrl } from "@/lib/security/url";

export const DT_LABEL = "DATAtourisme";

/** Types we never show (lodging, shops, services…), unless the POI also matches a category. */
const EXCLUDED_TYPES = new Set([
  "Accommodation", "LodgingBusiness", "Hotel", "HotelTrade", "Camping", "CampingAndCaravanning", "RentalAccommodation",
  "Store", "HypermarketAndSupermarket", "ServiceProvider", "BusinessPlace", "HealthcarePlace", "Transport",
  "LocalTouristOffice", "TouristInformationCenter", "Parking", "ConvenientService", "TourOperatorOrTravelAgency",
]);

// Multilingual values come as {"@fr": "...", "@en": "..."} — sometimes with array values.
const langString = z.record(z.string(), z.union([z.string(), z.array(z.string())]));
const pickFr = (v: z.infer<typeof langString> | undefined): string | null => {
  if (!v) return null;
  const raw = v["@fr"] ?? v["@en"] ?? Object.values(v)[0];
  const s = Array.isArray(raw) ? raw[0] : raw;
  return s?.trim() || null;
};

const strArr = z.array(z.string()).optional();

export const dtPoiSchema = z
  .object({
    uuid: z.string(),
    uri: z.string().optional(),
    label: langString,
    type: z.array(z.string()).default([]),
    lastUpdate: z.string().optional(),
    hasBeenCreatedBy: z.object({ legalName: z.string().optional(), homepage: strArr }).loose().optional(),
    hasDescription: z.array(z.object({ shortDescription: langString.optional(), description: langString.optional() }).loose()).optional(),
    isLocatedAt: z
      .array(
        z
          .object({
            geo: z.object({ latitude: z.coerce.number(), longitude: z.coerce.number() }).loose().optional(),
            address: z
              .array(
                z
                  .object({
                    streetAddress: strArr,
                    postalCode: z.string().optional(),
                    addressLocality: z.string().optional(),
                    hasAddressCity: z.object({ label: langString.optional() }).loose().optional(),
                  })
                  .loose(),
              )
              .optional(),
          })
          .loose(),
      )
      .optional(),
    hasContact: z.array(z.object({ homepage: strArr }).loose()).optional(),
    offers: z
      .array(
        z
          .object({
            priceSpecification: z
              .array(
                z
                  .object({
                    priceCurrency: z.string().optional(),
                    minPrice: z.array(z.coerce.number()).optional(),
                    maxPrice: z.array(z.coerce.number()).optional(),
                    name: langString.optional(),
                  })
                  .loose(),
              )
              .optional(),
          })
          .loose(),
      )
      .optional(),
    takesPlaceAt: z
      .array(
        z
          .object({ startDate: z.string(), endDate: z.string().optional(), startTime: z.string().optional(), endTime: z.string().optional() })
          .loose(),
      )
      .optional(),
    reducedMobilityAccess: z.boolean().optional(),
  })
  .loose();

function dtPrice(offers: z.infer<typeof dtPoiSchema>["offers"]): ActivityPrice {
  const specs = (offers ?? []).flatMap((o) => o.priceSpecification ?? []);
  const euros = specs.filter((s) => !s.priceCurrency || s.priceCurrency === "EUR");
  const amounts = euros.flatMap((s) => [...(s.minPrice ?? []), ...(s.maxPrice ?? [])]).filter((n) => Number.isFinite(n) && n >= 0);
  if (amounts.length === 0) return unknownPrice();
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const label = pickFr(euros[0]?.name);
  if (max === 0) return { kind: "free", min: 0, max: 0, currency: "EUR", label, status: "verified" };
  return { kind: "paid", min, max, currency: "EUR", label: label?.slice(0, 140) ?? null, status: "verified" };
}

const TIME = /^\d{2}:\d{2}(:\d{2})?$/;

function dtDates(periods: z.infer<typeof dtPoiSchema>["takesPlaceAt"]): ActivityDateRange[] | null {
  if (!periods?.length) return null;
  const out: ActivityDateRange[] = [];
  for (const p of periods.slice(0, 60)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.startDate)) continue;
    const endDate = p.endDate && /^\d{4}-\d{2}-\d{2}$/.test(p.endDate) ? p.endDate : p.startDate;
    // Times are local (Europe/Paris); keep them as local ISO without offset only when same-day,
    // otherwise plain dates are more honest.
    const sameDay = endDate === p.startDate;
    const start = sameDay && p.startTime && TIME.test(p.startTime) ? `${p.startDate}T${p.startTime.slice(0, 5)}:00` : p.startDate;
    const end = sameDay && p.endTime && TIME.test(p.endTime) ? `${endDate}T${p.endTime.slice(0, 5)}:00` : endDate;
    out.push({ start, end });
  }
  return out.length ? out : null;
}

export function normalizeDtPoi(raw: unknown, fetchedAt: string, kind: "place" | "event"): Activity | null {
  const parsed = dtPoiSchema.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  const name = pickFr(p.label);
  const loc = p.isLocatedAt?.[0];
  const lat = loc?.geo?.latitude;
  const lon = loc?.geo?.longitude;
  if (!name || !isValidLatLon({ lat, lon })) return null;

  let categories = categoriesFromDatatourismeTypes(p.type);
  // Broad parent classes only classify when nothing more specific matched.
  if (categories.length === 0) {
    if (p.type.includes("CulturalSite")) categories = ["heritage"];
    else if (p.type.includes("SportsAndLeisurePlace")) categories = ["leisure"];
    else return null;
  }
  if (p.type.some((t) => EXCLUDED_TYPES.has(t)) && !p.type.includes("EntertainmentAndEvent")) return null;

  const addr = loc?.address?.[0];
  const city = addr?.addressLocality ?? pickFr(addr?.hasAddressCity?.label) ?? null;
  const website = safeExternalUrl(p.hasContact?.flatMap((c) => c.homepage ?? [])[0]);
  const producer = p.hasBeenCreatedBy?.legalName?.slice(0, 120) ?? "office de tourisme";
  const recordUrl = safeExternalUrl(p.uri);
  const updated = p.lastUpdate && /^\d{4}-\d{2}-\d{2}/.test(p.lastUpdate) ? p.lastUpdate.slice(0, 10) : null;
  const attribution = `DATAtourisme — ${producer} (Licence Ouverte 2.0)${updated ? `, mis à jour le ${updated.split("-").reverse().join("/")}` : ""}`;
  const price = dtPrice(p.offers);
  const dates = kind === "event" ? dtDates(p.takesPlaceAt) : null;
  if (kind === "event" && !dates) return null;
  const desc = p.hasDescription?.[0];
  const wheelchair = typeof p.reducedMobilityAccess === "boolean" ? p.reducedMobilityAccess : null;

  return {
    id: `datatourisme:${p.uuid}`,
    kind,
    name: name.slice(0, 200),
    description: shortDescription(pickFr(desc?.shortDescription) ?? pickFr(desc?.description)),
    image: null, // The API does not expose images in practice (checked 10/2026).
    sourceUrl: recordUrl ?? website,
    website,
    wikipediaUrl: null,
    wikidataId: null,
    provider: "datatourisme",
    providerLabel: DT_LABEL,
    sources: [{ provider: "datatourisme", providerLabel: DT_LABEL, url: recordUrl ?? website, attribution }],
    address: joinAddress(addr?.streetAddress?.slice(-1)[0], [addr?.postalCode, city].filter(Boolean).join(" ") || null),
    city,
    location: { lat: lat!, lon: lon! },
    distanceKm: null,
    categories,
    price,
    environment: inferEnvironment(categories),
    audience: { childrenWelcome: null, ageMin: null, ageMax: null, status: "unknown" },
    accessibility: { wheelchair, status: wheelchair === null ? "unknown" : "verified" },
    dates,
    openingHours: null,
    infoStatus: overallStatus(["verified", price.status]),
    fetchedAt,
    updatedAt: updated,
    isDemo: false,
    notability: 0.3,
  };
}
