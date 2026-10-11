"use client";

import { Check } from "lucide-react";
import { clsx } from "clsx";

interface Option<T extends string> {
  id: T;
  label: string;
}

const chipBase =
  "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-[0.97rem] transition-colors focus-visible:outline-offset-2";
const chipOn = "border-forest-800 bg-forest-800 text-paper";
const chipOff = "border-forest-800/25 bg-card text-forest-900 hover:border-forest-800/60";

/** Multi-select chips (toggle buttons, aria-pressed). */
export function MultiChips<T extends string>({
  options,
  value,
  onChange,
  label,
  renderIcon,
}: {
  options: readonly Option<T>[];
  value: readonly T[];
  onChange: (v: T[]) => void;
  label: string;
  renderIcon?: (id: T) => React.ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
            className={clsx(chipBase, on ? chipOn : chipOff)}
          >
            {renderIcon?.(o.id)}
            {o.label}
            {on && <Check className="h-4 w-4" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

/** Single-select chips (radio group semantics). `allowNone` lets a second click unselect. */
export function SingleChips<T extends string>({
  options,
  value,
  onChange,
  label,
  allowNone = false,
}: {
  options: readonly Option<T>[];
  value: T | null;
  onChange: (v: T | null) => void;
  label: string;
  allowNone?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on && allowNone ? null : o.id)}
            className={clsx(chipBase, on ? chipOn : chipOff)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function FieldLabel({ children, hint, id }: { children: React.ReactNode; hint?: string; id?: string }) {
  return (
    <div className="mb-3">
      <p id={id} className="font-display text-lg font-semibold text-forest-900">
        {children}
      </p>
      {hint && <p className="text-[0.95rem] text-forest-700">{hint}</p>}
    </div>
  );
}
