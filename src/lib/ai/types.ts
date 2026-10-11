/**
 * Provider-independent AI layer. The app must work fully without AI: every AI feature is optional,
 * user-triggered, and falls back to the deterministic search on failure.
 */

export type AiErrorCode =
  | "not_configured" // no provider / key on the server
  | "quota_exceeded" // provider rate limit (HTTP 429), temporary
  | "credit_exhausted" // billing / credits exhausted (HTTP 402 or provider "insufficient_quota")
  | "invalid_key" // HTTP 401 / 403
  | "unavailable" // network error, timeout, 5xx
  | "daily_limit" // our own daily cap reached
  | "user_limit" // per-visitor cap reached
  | "bad_output"; // model answered something we could not validate

export const AI_MESSAGES: Record<AiErrorCode, string> = {
  not_configured: "Les recommandations IA ne sont pas activées sur ce site. La recherche classique fonctionne normalement.",
  quota_exceeded:
    "Le service de recommandations IA a atteint sa limite d'utilisation pour le moment. Tu peux continuer à rechercher des activités avec les filtres classiques.",
  credit_exhausted:
    "Le crédit du service IA est épuisé. Tu peux continuer à rechercher des activités avec les filtres classiques.",
  invalid_key: "Le service IA est mal configuré (clé refusée). Tu peux continuer avec les filtres classiques.",
  unavailable: "Le service IA ne répond pas pour le moment. Tu peux continuer avec les filtres classiques.",
  daily_limit:
    "Le nombre maximal de demandes IA pour aujourd'hui est atteint sur ce site. Tu peux continuer avec les filtres classiques.",
  user_limit: "Tu as fait beaucoup de demandes IA récemment. Réessaie un peu plus tard, ou utilise les filtres classiques.",
  bad_output: "Le service IA a renvoyé une réponse inexploitable. Tu peux continuer avec les filtres classiques.",
};

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly retryAfterSec: number | null;
  constructor(code: AiErrorCode, opts: { retryAfterSec?: number | null; detail?: string; cause?: unknown } = {}) {
    super(opts.detail ?? code, { cause: opts.cause });
    this.name = "AiError";
    this.code = code;
    this.retryAfterSec = opts.retryAfterSec ?? null;
  }
  get userMessage(): string {
    return AI_MESSAGES[this.code];
  }
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface AiCompletionOptions {
  maxTokens: number;
  /** Ask for a JSON object answer. */
  json: boolean;
  timeoutMs?: number;
}

export interface AiProvider {
  id: string;
  label: string;
  model: string;
  isConfigured(): boolean;
  complete(messages: ChatMessage[], opts: AiCompletionOptions): Promise<string>;
}
