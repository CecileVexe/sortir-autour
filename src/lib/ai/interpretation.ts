/**
 * Shared (client + server) part of the AI interpretation: validation schema and application onto a draft.
 * No server-only imports here.
 */
import { z } from "zod";
import { CATEGORY_IDS } from "@/config/categories";
import { AGE_GROUPS, BUDGET_PRESETS, COMPANIONS, DURATIONS, EVENT_TYPES, FAME, MOODS, RADIUS_MAX_KM } from "@/config/options";
import type { CriteriaDraft } from "@/lib/search/criteria";

const ids = <T extends readonly { id: string }[]>(arr: T) => arr.map((o) => o.id) as [T[number]["id"], ...T[number]["id"][]];

/** Lenient schema: each field falls back to undefined instead of failing the whole answer. */
const enumArray = <const T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.string())
    .transform((arr) => [...new Set(arr.filter((v): v is T[number] => (values as readonly string[]).includes(v)))])
    .optional()
    .catch(undefined);
const enumValue = <const T extends readonly [string, ...string[]]>(values: T) => z.enum(values).optional().catch(undefined);

export const interpretationSchema = z.object({
  categories: enumArray(CATEGORY_IDS),
  companions: enumArray(ids(COMPANIONS)),
  ageGroups: enumArray(ids(AGE_GROUPS)),
  environment: enumValue(["indoor", "outdoor", "any"]),
  budget: enumValue(ids(BUDGET_PRESETS)),
  customBudgetMax: z.number().min(0).max(10000).optional().catch(undefined),
  eventType: enumValue(ids(EVENT_TYPES)),
  mood: enumValue(ids(MOODS)),
  duration: enumValue(ids(DURATIONS)),
  fame: enumValue(ids(FAME)),
  accessibleOnly: z.boolean().optional().catch(undefined),
  when: z
    .object({ kind: z.enum(["any", "today", "weekend", "date"]), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish() })
    .optional()
    .catch(undefined),
  radiusKm: z.number().int().min(1).max(RADIUS_MAX_KM).optional().catch(undefined),
  keywords: z.string().max(200).optional().catch(undefined),
  summary: z.string().max(600).optional().catch(undefined),
});
export type Interpretation = z.infer<typeof interpretationSchema>;

/** Applies an interpretation onto a draft (used client-side after the user confirms). */
export function applyInterpretation(d: CriteriaDraft, i: Interpretation): CriteriaDraft {
  return {
    ...d,
    categories: i.categories?.length ? i.categories : d.categories,
    companions: i.companions?.length ? i.companions : d.companions,
    ageGroups: i.ageGroups?.length ? i.ageGroups : d.ageGroups,
    environment: i.environment ?? d.environment,
    budget: i.budget
      ? { ...d.budget, preset: i.budget, customMax: i.budget === "custom" ? (i.customBudgetMax ?? d.budget.customMax) : d.budget.customMax }
      : d.budget,
    eventType: i.eventType ?? d.eventType,
    mood: i.mood ?? d.mood,
    duration: i.duration ?? d.duration,
    fame: i.fame ?? d.fame,
    accessibleOnly: i.accessibleOnly ?? d.accessibleOnly,
    when: i.when ? { kind: i.when.kind, date: i.when.kind === "date" ? (i.when.date ?? null) : null } : d.when,
    radiusKm: i.radiusKm ?? d.radiusKm,
    query: i.keywords && !d.query ? i.keywords : d.query,
  };
}
