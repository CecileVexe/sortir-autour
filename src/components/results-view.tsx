"use client";

import { AlertTriangle, Info, LoaderCircle, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityCard } from "@/components/activity-card";
import { AiExplainPanel, type AiExplanation } from "@/components/ai";
import { FilterPanel } from "@/components/filter-panel";
import { SORTS } from "@/config/options";
import type { RankedActivity } from "@/lib/activity/types";
import { criteriaSummary } from "@/lib/activity/format";
import type { ApiErrorBody } from "@/lib/errors";
import { useFavorites } from "@/lib/favorites";
import type { SearchCriteria } from "@/lib/search/criteria";
import { formatWindow } from "@/lib/search/dates";
import type { SearchResponse } from "@/lib/search/engine";
import { draftToCriteria, resultsHref, useDraft } from "@/lib/search/use-draft";

type State =
  | { status: "loading" }
  | { status: "error"; message: string; retryAfterSec?: number }
  | {
      status: "ready";
      data: SearchResponse;
      items: RankedActivity[];
      loadingMore: boolean;
      moreError: string | null;
      /** Second phase running (slow sources such as OpenStreetMap). */
      upgrading: boolean;
      upgradeError: string | null;
    };

type Phase = "fast" | "full";

async function search(criteria: SearchCriteria, page: number, phase: Phase, signal?: AbortSignal): Promise<SearchResponse> {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ criteria, page, phase }),
    signal,
  });
  const json = (await res.json().catch(() => null)) as SearchResponse | ApiErrorBody | null;
  if (!res.ok || !json || "error" in json) {
    const err = json && "error" in json ? json.error : null;
    const e = new Error(err?.message ?? "La recherche a échoué. Réessaie dans un instant.") as Error & { retryAfterSec?: number };
    e.retryAfterSec = err?.retryAfterSec;
    throw e;
  }
  return json;
}

export function ResultsView({ criteria }: { criteria: SearchCriteria }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { draft, update, setDraft } = useDraft(criteria);
  const { isFavorite, toggle } = useFavorites();
  const key = JSON.stringify(criteria);

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: "loading" });
    (async () => {
      try {
        // Phase 1: fast sources (+ cached slow ones) → show results immediately.
        const fast = await search(criteria, 1, "fast", ctrl.signal);
        setState({ status: "ready", data: fast, items: fast.items, loadingMore: false, moreError: null, upgrading: fast.pending, upgradeError: null });
        if (!fast.pending) return;
        // Phase 2: every source live; fast ones are served from cache, so only the slow ones cost time.
        try {
          const full = await search(criteria, 1, "full", ctrl.signal);
          setState({ status: "ready", data: full, items: full.items, loadingMore: false, moreError: null, upgrading: false, upgradeError: null });
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
          setState((s) => (s.status === "ready" ? { ...s, upgrading: false, upgradeError: (err as Error).message } : s));
        }
      } catch (err) {
        const e = err as Error & { retryAfterSec?: number };
        if (e.name !== "AbortError") setState({ status: "error", message: e.message, retryAfterSec: e.retryAfterSec });
      }
    })();
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  // Keep the edit form in sync with the criteria shown.
  useEffect(() => setDraft({ ...criteria }), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (editing && !d.open) d.showModal();
    if (!editing && d.open) d.close();
  }, [editing]);

  const go = useCallback((c: SearchCriteria) => router.push(resultsHref(c)), [router]);

  async function loadMore() {
    if (state.status !== "ready" || !state.data.hasMore || state.upgrading) return;
    setState({ ...state, loadingMore: true, moreError: null });
    try {
      const data = await search(criteria, state.data.page + 1, state.data.phase);
      setState((s) => (s.status === "ready" ? { ...s, data, items: [...s.items, ...data.items], loadingMore: false, moreError: null } : s));
    } catch (err) {
      setState((s) => (s.status === "ready" ? { ...s, loadingMore: false, moreError: (err as Error).message } : s));
    }
  }

  const summary = criteriaSummary(criteria);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
      {/* Criteria summary */}
      <section aria-labelledby="criteres-title" className="rounded-card border border-forest-800/15 bg-card p-4 sm:p-5">
        <h1 id="criteres-title" className="sr-only">
          Résultats de recherche
        </h1>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-[0.95rem]">
            {summary.map((s) => (
              <div key={s.label}>
                <dt className="text-sm text-forest-700">{s.label}</dt>
                <dd className="font-semibold text-forest-900">{s.value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-11 items-center gap-2 rounded-control border border-forest-800/20 px-3">
              <span className="text-sm text-forest-700">Trier par</span>
              <select
                value={criteria.sort}
                onChange={(e) => go({ ...criteria, sort: e.target.value as SearchCriteria["sort"] })}
                className="bg-transparent font-medium outline-none"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-control bg-forest-800 px-4 font-medium text-paper hover:bg-forest-700"
            >
              <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
              Modifier les filtres
            </button>
          </div>
        </div>
      </section>

      <div aria-live="polite" aria-busy={state.status === "loading"} className="mt-6">
        {state.status === "loading" && <LoadingGrid />}
        {state.status === "error" && (
          <div role="alert" className="rounded-card border border-brick/40 bg-brick/5 p-6">
            <p className="flex items-center gap-2 font-display text-xl font-bold text-brick">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" /> La recherche n&apos;a pas abouti
            </p>
            <p className="mt-2 text-forest-900">{state.message}</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-control bg-forest-800 px-4 font-medium text-paper"
            >
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
              Relancer la recherche
            </button>
          </div>
        )}
        {state.status === "ready" && (
          <Results
            criteria={criteria}
            data={state.data}
            items={state.items}
            loadingMore={state.loadingMore}
            moreError={state.moreError}
            upgrading={state.upgrading}
            upgradeError={state.upgradeError}
            onMore={loadMore}
            go={go}
            isFavorite={isFavorite}
            toggleFavorite={toggle}
          />
        )}
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => setEditing(false)}
        aria-labelledby="edit-title"
        className="m-0 h-dvh max-h-none w-full max-w-none bg-paper p-0 backdrop:bg-forest-900/50 sm:m-auto sm:h-[90dvh] sm:max-w-3xl sm:rounded-card"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-forest-800/10 bg-paper px-4 py-3 sm:px-6">
          <h2 id="edit-title" className="font-display text-2xl font-bold">
            Modifier les filtres
          </h2>
          <button type="button" onClick={() => setEditing(false)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-forest-100" aria-label="Fermer">
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
        <div className="px-4 pt-6 sm:px-6">
          <p className="mb-6 text-forest-700">
            Départ : <strong className="text-forest-900">{criteria.origin.label}</strong>.{" "}
            <a href="/recherche" className="text-lake underline">
              Changer de point de départ
            </a>
          </p>
          {editing && (
            <FilterPanel
              draft={draft}
              update={update}
              submitLabel="Mettre à jour les résultats"
              onSubmit={() => {
                const c = draftToCriteria(draft);
                if (c) {
                  setEditing(false);
                  go(c);
                }
              }}
            />
          )}
        </div>
      </dialog>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div>
      <p className="mb-4 flex items-center gap-2 text-forest-800">
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
        On interroge les offices de tourisme, OpenStreetMap et OpenAgenda…
      </p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-card border border-forest-800/10 bg-card">
            <div className="aspect-[16/10] animate-pulse bg-forest-100" />
            <div className="space-y-2 p-4">
              <div className="h-5 w-3/4 animate-pulse rounded bg-forest-100" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-forest-100" />
              <div className="h-4 w-full animate-pulse rounded bg-forest-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Results({
  criteria,
  data,
  items,
  loadingMore,
  moreError,
  upgrading,
  upgradeError,
  onMore,
  go,
  isFavorite,
  toggleFavorite,
}: {
  criteria: SearchCriteria;
  data: SearchResponse;
  items: RankedActivity[];
  loadingMore: boolean;
  moreError: string | null;
  upgrading: boolean;
  upgradeError: string | null;
  onMore: () => void;
  go: (c: SearchCriteria) => void;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (a: RankedActivity) => void;
}) {
  const [why, setWhy] = useState<Record<string, string>>({});
  const failed = data.providers.filter((p) => p.status === "error" || p.status === "not_configured");
  const pendingLabels = data.providers.filter((p) => p.status === "pending").map((p) => p.label);
  const notices: string[] = [];
  if (upgradeError && pendingLabels.length) notices.push(`${pendingLabels.join(", ")} n'a pas pu compléter les résultats : ${upgradeError}`);
  if (data.stats.unknownPriceHidden > 0)
    notices.push(`${data.stats.unknownPriceHidden} activité(s) sans prix connu ont été masquées : on ne peut pas confirmer qu'elles sont gratuites.`);
  if (data.stats.placesWithoutDates > 0 && data.window.explicit)
    notices.push(`Pour ${formatWindow(data.window)}, seules les dates des événements sont vérifiées. Pour les lieux, consulte leurs horaires avant de partir.`);
  if (criteria.accessibleOnly && data.stats.accessibilityUnknown > 0)
    notices.push(`${data.stats.accessibilityUnknown} résultat(s) n'indiquent pas leur accessibilité : ils sont classés après les lieux accessibles.`);
  if (criteria.environment !== "any" && data.stats.environmentUnknown > 0)
    notices.push(`${data.stats.environmentUnknown} résultat(s) ne précisent pas s'ils sont en intérieur ou en extérieur.`);
  if (data.stats.queryIgnored) notices.push(`Aucun résultat ne contient « ${criteria.query} » : le mot-clé a été ignoré.`);
  notices.push(...data.notes);

  if (data.matched === 0 && upgrading) {
    return <UpgradeBanner labels={pendingLabels} />;
  }

  if (data.matched === 0) {
    const suggestions: { label: string; c: SearchCriteria }[] = [];
    if (criteria.radiusKm < 150) suggestions.push({ label: `Élargir à ${Math.min(150, criteria.radiusKm * 2)} km`, c: { ...criteria, radiusKm: Math.min(150, criteria.radiusKm * 2) } });
    if (criteria.budget.preset !== "any") suggestions.push({ label: "Ignorer le budget", c: { ...criteria, budget: { ...criteria.budget, preset: "any" } } });
    if (criteria.categories.length > 0) suggestions.push({ label: "Ouvrir à toutes les catégories", c: { ...criteria, categories: [] } });
    if (criteria.when.kind !== "any") suggestions.push({ label: "N'importe quelle date", c: { ...criteria, when: { kind: "any", date: null } } });
    if (criteria.environment !== "any") suggestions.push({ label: "Intérieur et extérieur", c: { ...criteria, environment: "any" } });
    if (criteria.query) suggestions.push({ label: "Retirer le mot-clé", c: { ...criteria, query: "" } });
    return (
      <div className="rounded-card border border-forest-800/15 bg-card p-6 sm:p-8">
        <p className="font-display text-2xl font-bold">Aucune sortie ne correspond à tous tes critères</p>
        <p className="mt-2 max-w-2xl text-forest-800">
          Les sources ont renvoyé {data.retrieved} activité(s) dans la zone, mais aucune ne passe tous les filtres. Essaie d&apos;en assouplir un :
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s.label} type="button" onClick={() => go(s.c)} className="min-h-11 rounded-full bg-balise px-4 font-medium text-forest-900 hover:bg-balise-deep">
              {s.label}
            </button>
          ))}
        </div>
        <ProviderNotices failed={failed} notices={notices} />
      </div>
    );
  }

  return (
    <>
      <div className="mb-5">
        <p className="font-display text-2xl font-bold text-forest-900">
          {data.matched} sortie{data.matched > 1 ? "s" : ""} correspond{data.matched > 1 ? "ent" : ""} à ta recherche
        </p>
        <p className="text-[0.95rem] text-forest-700">
          Parmi {data.retrieved} activités récupérées dans les sources pour cette zone. Ce n&apos;est pas un inventaire complet de tout
          ce qui existe autour de toi.
        </p>
      </div>
      {data.containsDemo && (
        <p className="mb-4 rounded-control bg-brick/10 px-4 py-3 font-medium text-brick">
          Mode démo actif : les cartes marquées « Démo (fictif) » ne sont pas de vraies activités.
        </p>
      )}
      {upgrading && <UpgradeBanner labels={pendingLabels} />}
      <ProviderNotices failed={failed} notices={notices} />
      <div className="mt-4">
        <AiExplainPanel
          key={data.generatedAt}
          criteria={criteria}
          ids={items.slice(0, 6).map((a) => a.id)}
          onExplained={(e: AiExplanation) => setWhy(Object.fromEntries(e.items.map((i) => [i.id, i.why])))}
        />
      </div>
      <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((a, i) => (
          <li key={a.id}>
            <ActivityCard a={a} favorite={isFavorite(a.id)} onToggleFavorite={toggleFavorite} priority={i < 3} aiWhy={why[a.id]} />
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-col items-center gap-2">
        <p className="text-sm text-forest-700">
          {items.length} affichée{items.length > 1 ? "s" : ""} sur {data.matched}
        </p>
        {data.hasMore && (
          <button
            type="button"
            onClick={onMore}
            disabled={loadingMore || upgrading}
            className="inline-flex min-h-12 items-center gap-2 rounded-control border-2 border-forest-800 px-6 font-medium text-forest-800 hover:bg-forest-100 disabled:opacity-60"
          >
            {loadingMore && <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />}
            Voir plus de sorties
          </button>
        )}
        {moreError && <p className="text-brick">{moreError}</p>}
      </div>
      <SourcesFooter data={data} />
    </>
  );
}

function UpgradeBanner({ labels }: { labels: string[] }) {
  return (
    <p className="mb-4 flex items-center gap-2 rounded-control bg-lake/10 px-4 py-3 text-[0.97rem] text-lake-deep">
      <LoaderCircle className="h-5 w-5 shrink-0 animate-spin" aria-hidden="true" />
      Recherche dans {labels.join(", ") || "les autres sources"} en cours : la liste sera complétée automatiquement.
    </p>
  );
}

function ProviderNotices({ failed, notices }: { failed: SearchResponse["providers"]; notices: string[] }) {
  if (failed.length === 0 && notices.length === 0) return null;
  return (
    <div className="mt-4 space-y-2">
      {failed.map((p) => (
        <p key={p.id} className="flex items-start gap-2 rounded-control bg-balise/20 px-4 py-2 text-[0.95rem] text-forest-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {p.message ?? `${p.label} n'a pas répondu.`} Les résultats peuvent être incomplets.
        </p>
      ))}
      {notices.length > 0 && (
        <details className="rounded-control bg-forest-100/70 px-4 py-2 text-[0.95rem]">
          <summary className="flex cursor-pointer items-center gap-2 font-medium">
            <Info className="h-4 w-4" aria-hidden="true" />À savoir sur ces résultats ({notices.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-forest-800">
            {notices.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SourcesFooter({ data }: { data: SearchResponse }) {
  const used = data.providers.filter((p) => p.status === "ok");
  return (
    <footer className="mt-10 border-t border-forest-800/10 pt-4 text-sm text-forest-700">
      <p>
        Données : {used.map((p) => p.attribution).join(" · ")}. Distances à vol d&apos;oiseau. Informations susceptibles d&apos;avoir changé :
        vérifie auprès de l&apos;organisateur.
      </p>
    </footer>
  );
}
