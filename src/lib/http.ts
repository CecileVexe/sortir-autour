import { AppError } from "@/lib/errors";

export interface FetchJsonOptions extends Omit<RequestInit, "signal"> {
  timeoutMs?: number;
  /** Label used in error messages (provider name). */
  label: string;
}

/**
 * fetch + timeout + JSON parsing + mapping of HTTP failures to typed AppErrors.
 * The response body is returned as `unknown`: callers must validate it.
 */
export async function fetchJson(url: string, opts: FetchJsonOptions): Promise<unknown> {
  const { timeoutMs = 8000, label, ...init } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch (err) {
    const aborted = (err as { name?: string })?.name === "AbortError";
    throw new AppError(
      aborted ? "provider_timeout" : "provider_unavailable",
      aborted ? `${label} met trop de temps à répondre.` : `${label} est injoignable pour le moment.`,
      { cause: err, detail: `${label}: ${aborted ? "timeout" : "network error"}` },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const retryAfter = Number.parseInt(res.headers.get("retry-after") ?? "", 10);
    if (res.status === 429) {
      throw new AppError("provider_quota", `${label} a atteint sa limite d'utilisation.`, {
        retryAfterSec: Number.isFinite(retryAfter) ? retryAfter : null,
        detail: `${label}: HTTP 429`,
      });
    }
    if (res.status === 401 || res.status === 403) {
      throw new AppError("provider_auth", `${label} refuse l'accès (clé manquante ou invalide).`, { detail: `${label}: HTTP ${res.status}` });
    }
    throw new AppError("provider_unavailable", `${label} est indisponible pour le moment.`, { detail: `${label}: HTTP ${res.status}` });
  }

  const text = await res.text();
  if (text.length > 8_000_000) {
    throw new AppError("provider_bad_response", `${label} a renvoyé une réponse trop volumineuse.`, { detail: `${label}: body too large` });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    throw new AppError("provider_bad_response", `${label} a renvoyé une réponse illisible.`, { cause: err, detail: `${label}: invalid JSON` });
  }
}
