/**
 * Server-side environment access. Never import this module from client components:
 * none of these values must reach the browser (no NEXT_PUBLIC_ prefix on purpose).
 */
import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .transform((s) => (s === "" ? undefined : s))
  .optional();

const boolFlag = (def: boolean) =>
  z
    .enum(["true", "false", "1", "0", ""])
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : v === "true" || v === "1"));

const intWithDefault = (def: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? Number.parseInt(v, 10) : Number.NaN;
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
    });

const schema = z.object({
  DATATOURISME_API_KEY: optionalString,
  OPENAGENDA_API_KEY: optionalString,
  UPSTASH_REDIS_REST_URL: optionalString,
  UPSTASH_REDIS_REST_TOKEN: optionalString,
  /** Contact URL or e-mail put in the User-Agent sent to OSM/Wikidata (required by their policies). */
  APP_CONTACT: optionalString,
  OVERPASS_URLS: optionalString,
  PROVIDER_OSM_ENABLED: boolFlag(true),
  PROVIDER_DATATOURISME_ENABLED: boolFlag(true),
  PROVIDER_OPENAGENDA_ENABLED: boolFlag(true),
  /** Demo provider: fictitious data, never enabled in production. */
  DEMO_DATA: boolFlag(false),
  SEARCH_RATE_LIMIT_PER_MIN: intWithDefault(20, 1, 600),
  GEOCODE_RATE_LIMIT_PER_MIN: intWithDefault(90, 1, 1200),
  // ---- AI (optional) ----
  AI_PROVIDER: z.enum(["none", "groq"]).optional().default("none"),
  GROQ_API_KEY: optionalString,
  GROQ_MODEL: optionalString,
  AI_DAILY_LIMIT: intWithDefault(200, 0, 100000),
  AI_PER_USER_PER_HOUR: intWithDefault(15, 0, 1000),
  AI_MAX_INPUT_CHARS: intWithDefault(500, 50, 4000),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached && process.env.NODE_ENV !== "test") return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Fail soft: an invalid optional variable must not take the whole app down.
    console.error(JSON.stringify({ level: "error", msg: "invalid env", issues: parsed.error.issues.map((i) => i.path.join(".")) }));
    cached = schema.parse({});
  } else {
    cached = parsed.data;
  }
  return cached;
}

export function userAgent(): string {
  const contact = env().APP_CONTACT ?? "https://github.com/CecileVexe/sortir-autour";
  return `SortirAutour/0.1 (+${contact})`;
}

export function isProduction(): boolean {
  return process.env.VERCEL_ENV === "production" || (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV);
}
