import { z } from "zod";
import { CATEGORY_IDS } from "@/config/categories";
import {
  AGE_GROUPS,
  BOOKINGS,
  BUDGET_PRESETS,
  COMPANIONS,
  DURATIONS,
  ENVIRONMENTS,
  EVENT_TYPES,
  FAME,
  MOODS,
  RADIUS_MAX_KM,
  RADIUS_MIN_KM,
  SORTS,
  TEXT_LIMITS,
  WHEN_OPTIONS,
} from "@/config/options";

const ids = <T extends readonly { id: string }[]>(arr: T) => arr.map((o) => o.id) as [T[number]["id"], ...T[number]["id"][]];

/** Strips control characters and trims. Used on every free-text input. */
const cleanText = (max: number) =>
  z
    .string()
    .max(max * 2) // hard cap before cleaning
    .transform((s) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max));

// Metropolitan France + overseas territories, generous bounds.
const latitude = z.number().min(-22).max(52);
const longitude = z.number().min(-62).max(56);

export const originSchema = z.object({
  label: cleanText(160).pipe(z.string().min(1)),
  lat: latitude,
  lon: longitude,
  city: cleanText(100).nullable().default(null),
  citycode: z.string().regex(/^[0-9AB]{5}$/).nullable().default(null),
  department: z.string().regex(/^[0-9AB]{2,3}$/).nullable().default(null),
});
export type Origin = z.infer<typeof originSchema>;

export const criteriaSchema = z.object({
  origin: originSchema,
  radiusKm: z.number().int().min(RADIUS_MIN_KM).max(RADIUS_MAX_KM).default(20),
  companions: z.array(z.enum(ids(COMPANIONS))).max(COMPANIONS.length).default([]),
  ageGroups: z.array(z.enum(ids(AGE_GROUPS))).max(AGE_GROUPS.length).default([]),
  budget: z
    .object({
      preset: z.enum(ids(BUDGET_PRESETS)).default("any"),
      customMax: z.number().min(0).max(10000).nullable().default(null),
      scope: z.enum(["person", "group"]).default("person"),
      groupSize: z.number().int().min(1).max(50).default(1),
    })
    .default({ preset: "any", customMax: null, scope: "person", groupSize: 1 }),
  environment: z.enum(ids(ENVIRONMENTS)).default("any"),
  categories: z.array(z.enum(CATEGORY_IDS)).max(CATEGORY_IDS.length).default([]),
  mood: z.enum(ids(MOODS)).nullable().default(null),
  duration: z.enum(ids(DURATIONS)).nullable().default(null),
  booking: z.enum(ids(BOOKINGS)).nullable().default(null),
  fame: z.enum(ids(FAME)).nullable().default(null),
  accessibleOnly: z.boolean().default(false),
  when: z
    .object({
      kind: z.enum(ids(WHEN_OPTIONS)).default("any"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
    })
    .default({ kind: "any", date: null }),
  eventType: z.enum(ids(EVENT_TYPES)).default("any"),
  query: cleanText(TEXT_LIMITS.query).default(""),
  ideal: cleanText(TEXT_LIMITS.ideal).default(""),
  sort: z.enum(ids(SORTS)).default("relevance"),
});

export type SearchCriteria = z.infer<typeof criteriaSchema>;
export type SearchCriteriaInput = z.input<typeof criteriaSchema>;

/** Criteria without origin, used by the forms before a place is chosen. */
export type CriteriaDraft = Omit<SearchCriteria, "origin"> & { origin: Origin | null };

export function defaultDraft(): CriteriaDraft {
  const { origin: _o, ...rest } = criteriaSchema.parse({
    origin: { label: "x", lat: 46, lon: 2 },
  });
  void _o;
  return { ...rest, origin: null };
}

/** Effective per-person budget ceiling in euros, or null when unbounded. */
export function budgetCeilingPerPerson(c: SearchCriteria): number | null {
  const { preset, customMax, scope, groupSize } = c.budget;
  let max: number | null;
  if (preset === "custom") max = customMax;
  else max = BUDGET_PRESETS.find((b) => b.id === preset)?.max ?? null;
  if (max === null) return null;
  return scope === "group" ? max / Math.max(1, groupSize) : max;
}

/** Minimum per-person price for the "> 50 €" preset. */
export function budgetFloorPerPerson(c: SearchCriteria): number | null {
  return c.budget.preset === "gt50" ? 50 : null;
}

// ---- URL (de)serialisation: criteria live in `?c=` as base64url JSON so results pages are shareable. ----

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export const MAX_ENCODED_CRITERIA_LENGTH = 4000;

export function encodeCriteria(c: SearchCriteria): string {
  return toBase64Url(JSON.stringify(c));
}

export function decodeCriteria(encoded: string | null | undefined): SearchCriteria | null {
  if (!encoded || encoded.length > MAX_ENCODED_CRITERIA_LENGTH) return null;
  try {
    const parsed = criteriaSchema.safeParse(JSON.parse(fromBase64Url(encoded)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
