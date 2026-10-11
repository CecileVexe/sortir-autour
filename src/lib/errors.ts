/** Typed application errors. `userMessage` is safe to show; `cause` stays server-side. */

export type AppErrorCode =
  | "invalid_input"
  | "rate_limited"
  | "payload_too_large"
  | "provider_unavailable"
  | "provider_timeout"
  | "provider_quota"
  | "provider_auth"
  | "provider_bad_response"
  | "internal";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly userMessage: string;
  readonly retryAfterSec: number | null;

  constructor(
    code: AppErrorCode,
    userMessage: string,
    opts: { status?: number; cause?: unknown; retryAfterSec?: number | null; detail?: string } = {},
  ) {
    super(opts.detail ?? userMessage, { cause: opts.cause });
    this.name = "AppError";
    this.code = code;
    this.status = opts.status ?? defaultStatus(code);
    this.userMessage = userMessage;
    this.retryAfterSec = opts.retryAfterSec ?? null;
  }
}

function defaultStatus(code: AppErrorCode): number {
  switch (code) {
    case "invalid_input":
      return 400;
    case "payload_too_large":
      return 413;
    case "rate_limited":
    case "provider_quota":
      return 429;
    case "provider_unavailable":
    case "provider_timeout":
    case "provider_bad_response":
      return 502;
    case "provider_auth":
      return 502;
    default:
      return 500;
  }
}

export interface ApiErrorBody {
  error: { code: AppErrorCode; message: string; retryAfterSec?: number };
}

export function toApiError(err: unknown): { status: number; body: ApiErrorBody } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: {
        error: {
          code: err.code,
          message: err.userMessage,
          ...(err.retryAfterSec ? { retryAfterSec: err.retryAfterSec } : {}),
        },
      },
    };
  }
  return {
    status: 500,
    body: { error: { code: "internal", message: "Une erreur inattendue s'est produite. Réessaie dans un instant." } },
  };
}
