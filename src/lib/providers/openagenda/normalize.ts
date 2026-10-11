import { z } from "zod";
import { categoriesFromText, type CategoryId } from "@/config/categories";
import { inferEnvironment, joinAddress, overallStatus, parseEuroAmount, plainText, shortDescription } from "@/lib/activity/normalize";
import { unknownPrice, type Activity, type ActivityPrice } from "@/lib/activity/types";
import { isValidLatLon } from "@/lib/geo/distance";
import { safeExternalUrl } from "@/lib/security/url";

export const OA_LABEL = "OpenAgenda";

const ml = z.union([z.string(), z.record(z.string(), z.string())]);
const fr = (v: z.infer<typeof ml> | null | undefined): string | null => {
  if (!v) return null;
  if (typeof v === "string") return v;
  return v.fr ?? v.en ?? Object.values(v)[0] ?? null;
};

export const oaEventSchema = z
  .object({
    uid: z.number(),
    title: ml,
    description: ml.nullish(),
    canonicalUrl: z.string().nullish(),
    image: z.object({ base: z.string(), filename: z.string() }).loose().nullish(),
    imageCredits: z.string().nullish(),
    conditions: ml.nullish(),
    keywords: z.union([z.array(z.string()), z.record(z.string(), z.array(z.string()))]).nullish(),
    age: z.object({ min: z.number().nullish(), max: z.number().nullish() }).nullish(),
    accessibility: z.record(z.string(), z.boolean()).nullish(),
    attendanceMode: z.number().nullish(),
    status: z.number().nullish(),
    updatedAt: z.string().nullish(),
    timings: z.array(z.object({ begin: z.string(), end: z.string() })).default([]),
    location: z
      .object({
        name: z.string().nullish(),
        address: z.string().nullish(),
        city: z.string().nullish(),
        latitude: z.coerce.number().nullish(),
        longitude: z.coerce.number().nullish(),
        website: z.string().nullish(),
      })
      .loose()
      .nullish(),
    rights: z
      .object({
        license: z.object({ name: z.string().nullish() }).loose().nullish(),
        licensor: z.object({ name: z.string().nullish() }).loose().nullish(),
      })
      .loose()
      .nullish(),
  })
  .loose();

const FREE_RE = /\b(gratuit|gratuite|entr[ée]e libre|acc[eè]s libre|sans frais|libre et gratuit)\b/i;

export function priceFromConditions(text: string | null): ActivityPrice {
  if (!text) return unknownPrice();
  const t = plainText(text) ?? "";
  const amounts = [...t.matchAll(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?)/gi)]
    .map((m) => parseEuroAmount(m[1] ?? null))
    .filter((n): n is number => n !== null);
  const label = t.slice(0, 140) || null;
  if (amounts.length > 0) {
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    // "Gratuit pour les moins de 12 ans, 8 €" → paid with a free reduced rate: report the range.
    return { kind: max === 0 ? "free" : "paid", min: FREE_RE.test(t) ? 0 : min, max, currency: "EUR", label, status: "indicative" };
  }
  if (FREE_RE.test(t)) return { kind: "free", min: 0, max: 0, currency: "EUR", label, status: "indicative" };
  return { ...unknownPrice(), label };
}

const CANCELLED = new Set([3, 6]); // moved online, cancelled
const ONLINE_ONLY = 2;

export function normalizeOaEvent(raw: unknown, fetchedAt: string): Activity | null {
  const parsed = oaEventSchema.safeParse(raw);
  if (!parsed.success) return null;
  const e = parsed.data;
  if (e.status && CANCELLED.has(e.status)) return null;
  if (e.attendanceMode === ONLINE_ONLY) return null;
  const lat = e.location?.latitude ?? undefined;
  const lon = e.location?.longitude ?? undefined;
  const name = plainText(fr(e.title));
  if (!name || !isValidLatLon({ lat, lon })) return null;
  if (e.timings.length === 0) return null;

  const description = fr(e.description);
  const keywords = Array.isArray(e.keywords) ? e.keywords : e.keywords ? (e.keywords.fr ?? []) : [];
  const categories = new Set<CategoryId>(["events"]);
  // Title + organiser keywords are reliable; the description only as a fallback (too noisy otherwise).
  let fromText = categoriesFromText(`${name} ${keywords.join(" ")}`);
  if (fromText.length === 0 && description) fromText = categoriesFromText(description).slice(0, 2);
  for (const c of fromText) categories.add(c);
  const cats = [...categories];

  const sourceUrl = safeExternalUrl(e.canonicalUrl);
  const imageUrl = e.image ? safeExternalUrl(`${e.image.base}${e.image.filename}`) : null;
  const price = priceFromConditions(fr(e.conditions));
  const ageMin = e.age?.min ?? null;
  const ageMax = e.age?.max ?? null;
  const hasAge = ageMin !== null || ageMax !== null;
  // `mi` = motor impairment. `false` means "not declared", not "inaccessible".
  const wheelchair = e.accessibility?.mi === true ? true : null;
  const licence = e.rights?.license?.name ?? "licence indiquée sur OpenAgenda";
  const licensor = e.rights?.licensor?.name;

  return {
    id: `openagenda:${e.uid}`,
    kind: "event",
    name: name.slice(0, 200),
    description: shortDescription(description),
    image: imageUrl ? { url: imageUrl, credit: e.imageCredits?.slice(0, 120) ?? null, license: null, sourcePage: sourceUrl } : null,
    sourceUrl,
    website: safeExternalUrl(e.location?.website),
    wikipediaUrl: null,
    wikidataId: null,
    provider: "openagenda",
    providerLabel: OA_LABEL,
    sources: [
      { provider: "openagenda", providerLabel: OA_LABEL, url: sourceUrl, attribution: `OpenAgenda${licensor ? ` — ${licensor}` : ""} (${licence})` },
    ],
    address: joinAddress(e.location?.name, e.location?.address),
    city: e.location?.city ?? null,
    location: { lat: lat!, lon: lon! },
    distanceKm: null,
    categories: cats,
    price,
    environment: inferEnvironment(cats.filter((c) => c !== "events")),
    audience: {
      childrenWelcome: hasAge ? (ageMin ?? 0) < 12 : null,
      ageMin,
      ageMax,
      status: hasAge ? "verified" : "unknown",
    },
    accessibility: { wheelchair, status: wheelchair ? "verified" : "unknown" },
    dates: e.timings.slice(0, 200).map((t) => ({ start: t.begin, end: t.end })),
    openingHours: null,
    infoStatus: overallStatus(["verified", price.status]),
    fetchedAt,
    updatedAt: e.updatedAt?.slice(0, 10) ?? null,
    isDemo: false,
    notability: 0.3,
  };
}
