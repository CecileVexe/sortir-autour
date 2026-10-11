"use client";

import { clsx } from "clsx";
import { RADIUS_MAX_KM, RADIUS_MIN_KM, RADIUS_PRESETS_KM } from "@/config/options";

/** Contour rings that grow with the radius: the visual signature of the app. */
export function ContourRings({ radiusKm, className }: { radiusKm: number; className?: string }) {
  // Map 1..150 km to a 0..1 scale (log, so small radii stay readable).
  const t = Math.log(radiusKm) / Math.log(RADIUS_MAX_KM);
  const rings = [0.25, 0.45, 0.65, 0.85, 1];
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true" focusable="false">
      {rings.map((r, i) => {
        const inside = r <= t + 0.001;
        return (
          <circle
            key={r}
            cx="100"
            cy="100"
            r={18 + r * 78}
            fill={inside && i === rings.findLastIndex((x) => x <= t + 0.001) ? "rgba(242,194,48,0.18)" : "none"}
            stroke={inside ? "#2c5640" : "#c9d6c2"}
            strokeWidth={inside ? 1.6 : 1}
            strokeDasharray={inside ? undefined : "3 4"}
            style={{ transition: "stroke 200ms, fill 200ms" }}
          />
        );
      })}
      <circle cx="100" cy="100" r="7" fill="#1f3d2e" />
      <rect x="92" y="98" width="16" height="4" rx="1" fill="#f2c230" />
    </svg>
  );
}

export function RadiusPicker({ value, onChange }: { value: number; onChange: (km: number) => void }) {
  const fill = `${((Math.log(value) - Math.log(RADIUS_MIN_KM)) / (Math.log(RADIUS_MAX_KM) - Math.log(RADIUS_MIN_KM))) * 100}%`;
  // The slider works on a log scale so that 1–20 km is not squeezed.
  const toSlider = (km: number) => Math.round((Math.log(km) / Math.log(RADIUS_MAX_KM)) * 1000);
  const fromSlider = (v: number) => Math.max(RADIUS_MIN_KM, Math.min(RADIUS_MAX_KM, Math.round(Math.exp((v / 1000) * Math.log(RADIUS_MAX_KM)))));

  return (
    <div className="grid items-center gap-6 sm:grid-cols-[160px_1fr]">
      <ContourRings radiusKm={value} className="mx-auto h-36 w-36 sm:h-40 sm:w-40" />
      <div>
        <p className="font-display text-4xl font-bold text-forest-800" aria-live="polite">
          {value} km
        </p>
        <p className="mb-4 text-[0.95rem] text-forest-700">Distance à vol d&apos;oiseau depuis ton point de départ, pas un temps de trajet.</p>
        <label htmlFor="radius-slider" className="sr-only">
          Distance maximale en kilomètres
        </label>
        <input
          id="radius-slider"
          type="range"
          className="trail w-full"
          min={0}
          max={1000}
          step={1}
          value={toSlider(value)}
          aria-valuetext={`${value} kilomètres`}
          onChange={(e) => onChange(fromSlider(Number(e.target.value)))}
          style={{ ["--fill" as string]: fill }}
        />
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Distances courantes">
          {RADIUS_PRESETS_KM.map((km) => (
            <button
              key={km}
              type="button"
              aria-pressed={value === km}
              onClick={() => onChange(km)}
              className={clsx(
                "min-h-11 rounded-full border px-4 text-[0.97rem]",
                value === km ? "border-forest-800 bg-forest-800 text-paper" : "border-forest-800/25 bg-card hover:border-forest-800/60",
              )}
            >
              {km} km
            </button>
          ))}
          <label className="inline-flex min-h-11 items-center gap-2 rounded-full border border-forest-800/25 bg-card px-3 text-[0.97rem]">
            <span>Autre</span>
            <input
              type="number"
              inputMode="numeric"
              min={RADIUS_MIN_KM}
              max={RADIUS_MAX_KM}
              value={value}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                if (Number.isFinite(n)) onChange(Math.max(RADIUS_MIN_KM, Math.min(RADIUS_MAX_KM, n)));
              }}
              className="w-16 bg-transparent text-right outline-none"
              aria-label="Distance personnalisée en kilomètres"
            />
            <span>km</span>
          </label>
        </div>
      </div>
    </div>
  );
}
