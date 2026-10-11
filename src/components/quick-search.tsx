"use client";

import { useRouter } from "next/navigation";
import { FilterPanel } from "@/components/filter-panel";
import { LocationPicker } from "@/components/location-picker";
import { draftToCriteria, resultsHref, useDraft } from "@/lib/search/use-draft";

/** Mode B: starting point first (mandatory), then every filter. Same draft + engine as the questionnaire. */
export function QuickSearch() {
  const router = useRouter();
  const { draft, update, ready } = useDraft();

  function submit() {
    const c = draftToCriteria(draft);
    if (c) router.push(resultsHref(c));
  }

  return (
    <div className="mt-8 space-y-10">
      <section aria-labelledby="depart-title" className="rounded-card border border-forest-800/15 bg-card p-5 sm:p-6">
        <h2 id="depart-title" className="mb-4 font-display text-2xl font-bold">
          Point de départ
        </h2>
        {ready && <LocationPicker value={draft.origin} onChange={(origin) => update({ origin })} autoFocus={!draft.origin} />}
      </section>
      {draft.origin ? (
        <section aria-label="Filtres">
          <FilterPanel draft={draft} update={update} onSubmit={submit} />
        </section>
      ) : (
        <p className="rounded-card border border-dashed border-forest-800/30 p-6 text-forest-700">
          Les filtres (distance, budget, thèmes, public, date…) s&apos;affichent dès que tu as choisi un point de départ.
        </p>
      )}
    </div>
  );
}
