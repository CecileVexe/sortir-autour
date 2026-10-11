"use client";

import { Accessibility, CalendarDays, ExternalLink, Heart, Info, MapPin, Share2, Sparkles } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { clsx } from "clsx";
import { CategoryIcon } from "@/components/category-icon";
import type { RankedActivity } from "@/lib/activity/types";
import { categoryLabels, formatPrice, primaryLink, primaryLinkLabel } from "@/lib/activity/format";
import { formatDistance } from "@/lib/geo/distance";
import { formatDateRange } from "@/lib/search/dates";
import { hostLabel, isOptimizableImageHost } from "@/lib/security/url";

/** Generic illustration when the source has no image — clearly a drawing, never a fake photo. */
function Placeholder({ a }: { a: RankedActivity }) {
  const cat = a.categories[0];
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-forest-100">
      <svg viewBox="0 0 200 120" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {[20, 38, 56, 74, 92].map((r, i) => (
          <ellipse key={r} cx={150} cy={95} rx={r * 1.4} ry={r} fill="none" stroke="#a9c4b0" strokeWidth={i === 2 ? 1.6 : 1} />
        ))}
      </svg>
      {cat && (
        <span className="relative grid h-14 w-14 place-items-center rounded-full bg-card">
          <CategoryIcon id={cat} className="h-7 w-7 text-forest-700" />
        </span>
      )}
    </div>
  );
}

export function ActivityCard({
  a,
  favorite,
  onToggleFavorite,
  priority = false,
  aiWhy,
}: {
  a: RankedActivity;
  favorite: boolean;
  onToggleFavorite: (a: RankedActivity) => void;
  priority?: boolean;
  /** Optional AI explanation (from retrieved data only). */
  aiWhy?: string;
}) {
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const link = primaryLink(a);
  const linkLabel = primaryLinkLabel(a);
  const source = a.sources[0];
  const secondary = a.sourceUrl && a.sourceUrl !== link ? a.sourceUrl : null;
  const date = a.nextDate ?? a.dates?.[0] ?? null;

  async function share() {
    const url = link ?? a.sourceUrl;
    if (!url) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: a.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareMsg("Lien copié");
    } catch {
      setShareMsg(null);
    }
    setTimeout(() => setShareMsg(null), 2500);
  }

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-card border border-forest-800/15 bg-card">
      <div className="relative aspect-[16/10] w-full">
        {a.image ? (
          isOptimizableImageHost(a.image.url) ? (
            <Image
              src={a.image.url}
              alt=""
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover"
              priority={priority}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.image.url} alt="" loading="lazy" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          )
        ) : (
          <Placeholder a={a} />
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {a.isDemo && <span className="rounded-full bg-brick px-2.5 py-1 text-xs font-bold text-white">Démo (fictif)</span>}
          {a.kind === "event" && <span className="rounded-full bg-balise px-2.5 py-1 text-xs font-bold text-forest-900">Événement</span>}
        </div>
        <button
          type="button"
          onClick={() => onToggleFavorite(a)}
          aria-pressed={favorite}
          aria-label={favorite ? `Retirer « ${a.name} » des favoris` : `Ajouter « ${a.name} » aux favoris`}
          className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full bg-card/90 text-forest-800 hover:bg-card"
        >
          <Heart className={clsx("h-5 w-5", favorite && "fill-brick text-brick")} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-1 flex flex-wrap gap-x-2 text-sm text-forest-700">
          {categoryLabels(a).map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
        <h3 className="line-clamp-2 font-display text-xl font-bold leading-snug text-forest-900">{a.name}</h3>

        <ul className="mt-2 space-y-1 text-[0.95rem] text-forest-800">
          <li className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
            <span>
              {a.distanceKm !== null && <strong className="font-semibold">{formatDistance(a.distanceKm)}</strong>}
              {a.distanceKm !== null && <span className="sr-only"> à vol d&apos;oiseau</span>}
              {a.city && <span>{a.distanceKm !== null ? ", " : ""}{a.city}</span>}
            </span>
          </li>
          {date && (
            <li className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
              <span>
                {formatDateRange(date)}
                {(a.dates?.length ?? 0) > 1 && <span className="text-forest-700"> · autres dates</span>}
              </span>
            </li>
          )}
          <li className={clsx("font-semibold", a.price.kind === "unknown" && "font-normal text-forest-700")}>{formatPrice(a.price)}</li>
          {a.accessibility.wheelchair === true && (
            <li className="flex items-center gap-2 text-forest-700">
              <Accessibility className="h-4 w-4" aria-hidden="true" /> Accessible en fauteuil (selon la source)
            </li>
          )}
        </ul>

        {a.description && <p className="mt-3 line-clamp-3 text-[0.95rem] text-forest-800">{a.description}</p>}

        {aiWhy && (
          <p className="mt-3 flex gap-2 rounded-control bg-lake/5 p-2 text-[0.93rem] text-lake-deep">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="sr-only">Explication générée par IA : </span>
              {aiWhy}
            </span>
          </p>
        )}

        {a.unverified.length > 0 && (
          <details className="mt-3 text-sm text-forest-700">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
              <Info className="h-4 w-4" aria-hidden="true" />
              {a.unverified.length === 1 ? "1 information non vérifiée" : `${a.unverified.length} informations non vérifiées`}
            </summary>
            <ul className="mt-1 list-disc pl-6">
              {a.unverified.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </details>
        )}

        <div className="mt-auto pt-4">
          <p className="mb-3 text-xs text-forest-700">
            Source : {source?.attribution ?? a.providerLabel}
            {a.sources.length > 1 && ` + ${a.sources.length - 1} autre${a.sources.length > 2 ? "s" : ""}`}
            {a.image?.credit || a.image?.license ? (
              <>
                {" "}
                · Photo :{" "}
                {a.image.sourcePage ? (
                  <a href={a.image.sourcePage} target="_blank" rel="noopener noreferrer" className="underline">
                    {[a.image.credit, a.image.license].filter(Boolean).join(", ")}
                  </a>
                ) : (
                  [a.image.credit, a.image.license].filter(Boolean).join(", ")
                )}
              </>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-control bg-forest-800 px-4 font-medium text-paper hover:bg-forest-700"
              >
                {linkLabel}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">(nouvel onglet, {hostLabel(link)})</span>
              </a>
            ) : (
              <span className="inline-flex min-h-11 flex-1 items-center justify-center rounded-control border border-dashed border-forest-800/30 px-4 text-sm text-forest-700">
                {a.isDemo ? "Activité fictive, sans lien" : "Pas de lien disponible"}
              </span>
            )}
            {link && (
              <button
                type="button"
                onClick={share}
                className="grid h-11 w-11 place-items-center rounded-control border border-forest-800/20 text-forest-800 hover:bg-forest-100"
                aria-label={`Partager « ${a.name} »`}
              >
                <Share2 className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
          {secondary && (
            <a href={secondary} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-lake underline-offset-2 hover:underline">
              Fiche {a.providerLabel}
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          )}
          <p role="status" aria-live="polite" className="text-sm text-forest-700">
            {shareMsg}
          </p>
        </div>
      </div>
    </article>
  );
}
