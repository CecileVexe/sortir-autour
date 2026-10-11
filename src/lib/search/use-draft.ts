"use client";

import { useCallback, useEffect, useState } from "react";
import { criteriaSchema, defaultDraft, encodeCriteria, type CriteriaDraft, type SearchCriteria } from "@/lib/search/criteria";

const KEY = "sortir-autour:draft:v1";

/** Validates a draft into full criteria (null when the starting point is missing or a value is invalid). */
export function draftToCriteria(d: CriteriaDraft): SearchCriteria | null {
  if (!d.origin) return null;
  const r = criteriaSchema.safeParse(d);
  return r.success ? r.data : null;
}

export function resultsHref(c: SearchCriteria): string {
  return `/resultats?c=${encodeCriteria(c)}`;
}

function load(): CriteriaDraft {
  const base = defaultDraft();
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<CriteriaDraft>;
    const merged = { ...base, ...parsed };
    // Re-validate what we can; drop the origin if it is no longer valid.
    if (merged.origin && !criteriaSchema.shape.origin.safeParse(merged.origin).success) merged.origin = null;
    const check = criteriaSchema.safeParse({ ...merged, origin: merged.origin ?? { label: "x", lat: 46, lon: 2 } });
    return check.success ? { ...check.data, origin: merged.origin } : base;
  } catch {
    return base;
  }
}

/**
 * Search draft kept in sessionStorage (per tab, cleared when the tab closes) so answers survive
 * step changes and page navigation. Nothing is sent anywhere until the user launches the search.
 */
export function useDraft(initial?: SearchCriteria | null) {
  const [draft, setDraft] = useState<CriteriaDraft>(() => (initial ? { ...initial } : defaultDraft()));
  const [ready, setReady] = useState(!!initial);

  useEffect(() => {
    if (initial) return;
    // Browser storage is only readable after hydration: loading it here is the intended use of an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(load());
    setReady(true);
  }, [initial]);

  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(draft));
    } catch {
      /* storage unavailable (private mode…): the draft simply isn't persisted */
    }
  }, [draft, ready]);

  const update = useCallback((patch: Partial<CriteriaDraft>) => setDraft((d) => ({ ...d, ...patch })), []);
  const reset = useCallback(() => setDraft((d) => ({ ...defaultDraft(), origin: d.origin })), []);

  return { draft, update, reset, ready, setDraft };
}
