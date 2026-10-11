"use client";

import { LoaderCircle, LocateFixed, MapPin, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { clsx } from "clsx";
import type { Origin } from "@/lib/search/criteria";

interface Suggestion extends Origin {
  kind: string;
  context: string | null;
}

/**
 * Starting point: autocomplete (IGN Géoplateforme via /api/geocode) + optional browser geolocation.
 * Accessible combobox (WAI-ARIA 1.2 pattern).
 */
export function LocationPicker({
  value,
  onChange,
  autoFocus = false,
  size = "md",
}: {
  value: Origin | null;
  onChange: (o: Origin | null) => void;
  autoFocus?: boolean;
  size?: "md" | "lg";
}) {
  const [text, setText] = useState(value?.label ?? "");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep the input text in sync when the selected place changes from outside (adjust state during render).
  const [syncedLabel, setSyncedLabel] = useState(value?.label);
  if (syncedLabel !== value?.label) {
    setSyncedLabel(value?.label);
    if (value?.label) setText(value.label);
  }

  // Debounced autocomplete, only while the user types something different from the current selection.
  useEffect(() => {
    const q = text.trim();
    if (q.length < 3 || q === value?.label) return;
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(`/api/geocode?${new URLSearchParams({ q })}`, { signal: ctrl.signal });
        const json = (await res.json()) as { results?: Suggestion[]; error?: { message: string } };
        if (!res.ok) throw new Error(json.error?.message ?? "Recherche de lieu indisponible.");
        setResults(json.results ?? []);
        setOpen(true);
        setActive(-1);
        setError(null);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [text, value?.label]);

  function choose(s: Suggestion) {
    const { kind: _k, context: _c, ...origin } = s;
    void _k;
    void _c;
    onChange(origin);
    setText(origin.label);
    setOpen(false);
    setResults([]);
    setError(null);
  }

  function locate() {
    if (!("geolocation" in navigator)) {
      setError("La géolocalisation n'est pas disponible sur cet appareil. Saisis ta ville.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          // Rounded to ~100 m: precise enough for distances, avoids keeping an exact position.
          const lat = Number(pos.coords.latitude.toFixed(3));
          const lon = Number(pos.coords.longitude.toFixed(3));
          const res = await fetch("/api/geocode", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat, lon }),
          });
          const json = (await res.json()) as { results?: Suggestion[]; error?: { message: string } };
          const first = json.results?.[0];
          if (!res.ok || !first) throw new Error(json.error?.message ?? "Position introuvable. Saisis ta ville.");
          choose(first);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Géolocalisation refusée. Tu peux saisir ta ville à la place."
            : "Position indisponible pour le moment. Saisis ta ville.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || visible.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % visible.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? visible.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = visible[active >= 0 ? active : 0];
      if (s) choose(s);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const big = size === "lg";
  const q = text.trim();
  const visible = q.length < 3 || q === value?.label ? [] : results;

  return (
    <div className="w-full">
      <div className="relative">
        <label htmlFor={`${listId}-input`} className="sr-only">
          Ville, code postal ou adresse de départ
        </label>
        <MapPin
          className={clsx("pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-forest-700", big ? "h-6 w-6" : "h-5 w-5")}
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id={`${listId}-input`}
          type="text"
          role="combobox"
          aria-expanded={open && visible.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          maxLength={120}
          placeholder="Ville, code postal ou adresse"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (value) onChange(null);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => visible.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className={clsx(
            "w-full rounded-control border-2 bg-card pr-12 text-forest-900 placeholder:text-forest-700/70",
            value ? "border-forest-700" : "border-forest-800/25 focus:border-forest-800",
            big ? "h-16 pl-12 text-xl" : "h-13 pl-11 text-lg",
          )}
        />
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {loading && <LoaderCircle className="h-5 w-5 animate-spin text-forest-700" aria-label="Recherche en cours" />}
          {text && !loading && (
            <button
              type="button"
              onClick={() => {
                setText("");
                onChange(null);
                inputRef.current?.focus();
              }}
              className="rounded-full p-1.5 text-forest-700 hover:bg-forest-100"
              aria-label="Effacer le lieu"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
        {open && visible.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Suggestions de lieux"
            className="absolute z-30 mt-2 w-full overflow-hidden rounded-control border border-forest-800/15 bg-card shadow-[0_12px_32px_-12px_rgba(18,38,27,0.35)]"
          >
            {visible.map((s, i) => (
              <li
                key={`${s.label}-${i}`}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={clsx("flex cursor-pointer flex-col px-4 py-3", i === active && "bg-forest-100")}
              >
                <span className="font-medium">{s.label}</span>
                {s.context && <span className="text-sm text-forest-700">{s.context}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 font-medium text-lake hover:bg-lake/10 disabled:opacity-60"
        >
          {locating ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : <LocateFixed className="h-5 w-5" aria-hidden="true" />}
          {locating ? "Localisation…" : "Utiliser ma position"}
        </button>
        <span className="text-sm text-forest-700">Ta position n&apos;est demandée que si tu cliques, et n&apos;est pas conservée.</span>
      </div>
      <p role="status" aria-live="polite" className={clsx("mt-2 text-[0.95rem]", error ? "text-brick" : "sr-only")}>
        {error ?? (value ? `Point de départ : ${value.label}` : "")}
      </p>
    </div>
  );
}
