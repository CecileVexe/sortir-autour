/**
 * Enriches OSM places that carry a `wikidata` tag:
 *  - short description (Wikidata, CC0),
 *  - French Wikipedia article link,
 *  - main image (P18) from Wikimedia Commons, with author + licence for attribution.
 * Failures are swallowed: enrichment is optional.
 */
import { z } from "zod";
import { userAgent } from "@/lib/env";
import { fetchJson } from "@/lib/http";
import { errorSummary, log } from "@/lib/log";
import { plainText, shortDescription } from "@/lib/activity/normalize";
import type { Activity, ActivityImage } from "@/lib/activity/types";
import { safeExternalUrl } from "@/lib/security/url";

const MAX_IDS = 100;
const BATCH = 50;

const entitiesSchema = z.object({
  entities: z.record(
    z.string(),
    z
      .object({
        descriptions: z.record(z.string(), z.object({ value: z.string() })).optional(),
        sitelinks: z.record(z.string(), z.object({ title: z.string() })).optional(),
        claims: z
          .record(
            z.string(),
            z.array(z.object({ mainsnak: z.object({ datavalue: z.object({ value: z.unknown() }).optional() }) })),
          )
          .optional(),
      })
      .loose(),
  ),
});

const imageInfoSchema = z.object({
  query: z
    .object({
      normalized: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
      pages: z.record(
        z.string(),
        z.object({
          title: z.string(),
          imageinfo: z
            .array(
              z.object({
                thumburl: z.string().optional(),
                url: z.string().optional(),
                descriptionurl: z.string().optional(),
                extmetadata: z.record(z.string(), z.object({ value: z.unknown() })).optional(),
              }),
            )
            .optional(),
        }),
      ),
    })
    .optional(),
});

interface WikidataInfo {
  description: string | null;
  wikipediaUrl: string | null;
  imageFile: string | null;
}

async function fetchEntities(ids: string[]): Promise<Map<string, WikidataInfo>> {
  const out = new Map<string, WikidataInfo>();
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const params = new URLSearchParams({
      action: "wbgetentities",
      ids: chunk.join("|"),
      props: "descriptions|sitelinks|claims",
      languages: "fr",
      sitefilter: "frwiki",
      format: "json",
    });
    const json = await fetchJson(`https://www.wikidata.org/w/api.php?${params}`, {
      label: "Wikidata",
      timeoutMs: 6000,
      headers: { "User-Agent": userAgent() },
    });
    const parsed = entitiesSchema.safeParse(json);
    if (!parsed.success) continue;
    for (const [id, e] of Object.entries(parsed.data.entities)) {
      const p18 = e.claims?.P18?.[0]?.mainsnak.datavalue?.value;
      const title = e.sitelinks?.frwiki?.title;
      out.set(id, {
        description: e.descriptions?.fr?.value ?? null,
        wikipediaUrl: title ? safeExternalUrl(`https://fr.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`) : null,
        imageFile: typeof p18 === "string" ? p18 : null,
      });
    }
  }
  return out;
}

async function fetchImages(files: string[]): Promise<Map<string, ActivityImage>> {
  const out = new Map<string, ActivityImage>();
  for (let i = 0; i < files.length; i += BATCH) {
    const chunk = files.slice(i, i + BATCH);
    const params = new URLSearchParams({
      action: "query",
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      iiurlwidth: "640",
      iiextmetadatafilter: "Artist|LicenseShortName|Credit",
      titles: chunk.map((f) => `File:${f}`).join("|"),
      format: "json",
    });
    const json = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`, {
      label: "Wikimedia Commons",
      timeoutMs: 6000,
      headers: { "User-Agent": userAgent() },
    });
    const parsed = imageInfoSchema.safeParse(json);
    if (!parsed.success || !parsed.data.query) continue;
    const normalized = new Map((parsed.data.query.normalized ?? []).map((n) => [n.to, n.from]));
    for (const page of Object.values(parsed.data.query.pages)) {
      const info = page.imageinfo?.[0];
      const url = safeExternalUrl(info?.thumburl ?? info?.url);
      if (!info || !url) continue;
      const meta = info.extmetadata ?? {};
      const str = (k: string) => (typeof meta[k]?.value === "string" ? plainText(meta[k]!.value as string) : null);
      const requested = (normalized.get(page.title) ?? page.title).replace(/^File:/, "");
      out.set(requested.replace(/_/g, " "), {
        url,
        credit: str("Artist")?.slice(0, 120) ?? null,
        license: str("LicenseShortName"),
        sourcePage: safeExternalUrl(info.descriptionurl),
      });
    }
  }
  return out;
}

export async function enrichWithWikidata(activities: Activity[]): Promise<Activity[]> {
  // Most notable first, so the cap keeps the interesting ones.
  const byNotability = [...activities].sort((a, b) => b.notability - a.notability);
  const ids = [...new Set(byNotability.map((a) => a.wikidataId).filter((x): x is string => !!x))].slice(0, MAX_IDS);
  if (ids.length === 0) return activities;
  try {
    const entities = await fetchEntities(ids);
    const files = [...new Set([...entities.values()].map((e) => e.imageFile).filter((f): f is string => !!f))];
    const images = files.length ? await fetchImages(files).catch(() => new Map<string, ActivityImage>()) : new Map<string, ActivityImage>();
    return activities.map((a) => {
      const info = a.wikidataId ? entities.get(a.wikidataId) : undefined;
      if (!info) return a;
      const image = info.imageFile ? (images.get(info.imageFile.replace(/_/g, " ")) ?? null) : null;
      return {
        ...a,
        description: a.description ?? shortDescription(info.description),
        wikipediaUrl: a.wikipediaUrl ?? info.wikipediaUrl,
        image: a.image ?? image,
        notability: Math.min(1, a.notability + (info.wikipediaUrl ? 0.2 : 0) + (image ? 0.1 : 0)),
      };
    });
  } catch (err) {
    log.warn("wikidata enrichment failed", { err: errorSummary(err) });
    return activities;
  }
}
