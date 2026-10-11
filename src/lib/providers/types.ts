import type { Activity, ProviderId } from "@/lib/activity/types";
import type { SearchCriteria } from "@/lib/search/criteria";
import type { DateWindow } from "@/lib/search/dates";

export interface ProviderContext {
  criteria: SearchCriteria;
  window: DateWindow;
  now: Date;
  /** Whether permanent places / events are wanted for this search. */
  wantPlaces: boolean;
  wantEvents: boolean;
}

export interface ProviderOutput {
  activities: Activity[];
  cacheHit: boolean;
  /** Non-fatal note for the UI (e.g. "rayon limité à 50 km pour cette source"). */
  note?: string;
}

/**
 * A data source. Implementations must:
 *  - never throw for "no data" (return an empty list),
 *  - throw AppError for real failures (the engine isolates them),
 *  - validate external payloads and leave unknown fields null.
 */
export interface ActivityProvider {
  id: ProviderId;
  label: string;
  /** Attribution text required by the source licence. */
  attribution: string;
  /** Max time the engine waits for this provider (ms). Defaults to the engine deadline. */
  timeoutMs?: number;
  /**
   * Slow source (e.g. overloaded public Overpass). In the "fast" search phase only its cached
   * results are used (`peek`); the client then runs the "full" phase to add live results.
   */
  slow?: boolean;
  peek?(ctx: ProviderContext): Promise<ProviderOutput | null>;
  /** Has the configuration it needs (keys…). */
  isConfigured(): boolean;
  /** Enabled by configuration flags. */
  isEnabled(): boolean;
  /** Whether this provider is relevant for the search (e.g. events-only provider on a "permanent" search). */
  appliesTo(ctx: ProviderContext): boolean;
  search(ctx: ProviderContext): Promise<ProviderOutput>;
}

export type ProviderStatus = "ok" | "error" | "disabled" | "not_configured" | "skipped" | "pending";

export interface ProviderReport {
  id: ProviderId;
  label: string;
  status: ProviderStatus;
  count: number;
  cacheHit?: boolean;
  message?: string;
  attribution: string;
}
