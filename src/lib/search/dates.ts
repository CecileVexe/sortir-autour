import type { ActivityDateRange } from "@/lib/activity/types";
import type { SearchCriteria } from "@/lib/search/criteria";

const TZ = "Europe/Paris";

/** YYYY-MM-DD of `d` in Europe/Paris. */
export function parisDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function parisWeekday(d: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Inclusive date window (Paris calendar days). */
export interface DateWindow {
  from: string;
  to: string;
  /** True when the user explicitly asked for a date/period. */
  explicit: boolean;
}

export const DEFAULT_EVENT_HORIZON_DAYS = 30;

export function dateWindow(c: Pick<SearchCriteria, "when">, now = new Date()): DateWindow {
  const today = parisDate(now);
  switch (c.when.kind) {
    case "today":
      return { from: today, to: today, explicit: true };
    case "weekend": {
      const wd = parisWeekday(now);
      if (wd === 6) return { from: today, to: addDays(today, 1), explicit: true };
      if (wd === 0) return { from: today, to: today, explicit: true };
      const sat = addDays(today, 6 - wd);
      return { from: sat, to: addDays(sat, 1), explicit: true };
    }
    case "date": {
      const d = c.when.date && c.when.date >= today ? c.when.date : today;
      return { from: d, to: d, explicit: true };
    }
    default:
      return { from: today, to: addDays(today, DEFAULT_EVENT_HORIZON_DAYS), explicit: false };
  }
}

/** Calendar day (Paris) of an ISO date or datetime. */
function dayOf(iso: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? parisDate(new Date(t)) : null;
}

/** Occurrences overlapping the window, sorted by start. */
export function occurrencesInWindow(dates: readonly ActivityDateRange[], w: DateWindow): ActivityDateRange[] {
  return dates
    .filter((r) => {
      const s = dayOf(r.start);
      const e = dayOf(r.end) ?? s;
      return s !== null && e !== null && s <= w.to && e >= w.from;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

const dayFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

/** Human label, e.g. "sam. 18 oct., 14:00" or "du 2 mai au 2 nov.". */
export function formatDateRange(r: ActivityDateRange): string {
  const hasTime = (s: string) => s.length > 10;
  const toDate = (s: string) => (hasTime(s) ? new Date(s) : new Date(`${s}T12:00:00Z`));
  const s = toDate(r.start);
  const e = toDate(r.end);
  const sameDay = dayOf(r.start) === dayOf(r.end);
  if (sameDay) return hasTime(r.start) ? `${dayFmt.format(s)}, ${timeFmt.format(s)}` : dayFmt.format(s);
  return `du ${dayFmt.format(s)} au ${dayFmt.format(e)}`;
}

export function formatWindow(w: DateWindow): string {
  const f = (d: string) => dayFmt.format(new Date(`${d}T12:00:00Z`));
  return w.from === w.to ? f(w.from) : `du ${f(w.from)} au ${f(w.to)}`;
}
