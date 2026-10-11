/**
 * Groq (OpenAI-compatible chat completions). Free tier with per-model rate limits; HTTP 429 when exceeded.
 * Groq does not expose the remaining daily quota in a way we can rely on, so we never display it.
 * Model is configurable (GROQ_MODEL) because Groq retires models regularly.
 */
import { z } from "zod";
import { env } from "@/lib/env";
import { AiError, type AiCompletionOptions, type AiProvider, type ChatMessage } from "@/lib/ai/types";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

const responseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

const errorBodySchema = z.object({ error: z.object({ code: z.string().nullish(), type: z.string().nullish(), message: z.string().nullish() }) }).partial();

/** Maps an HTTP failure to an AiError. Exported for tests. */
export function mapGroqError(status: number, body: unknown, retryAfterHeader: string | null): AiError {
  const parsed = errorBodySchema.safeParse(body);
  const code = `${parsed.success ? (parsed.data.error?.code ?? "") : ""} ${parsed.success ? (parsed.data.error?.type ?? "") : ""}`.toLowerCase();
  const retry = Number.parseInt(retryAfterHeader ?? "", 10);
  const retryAfterSec = Number.isFinite(retry) ? retry : null;
  if (status === 402 || /insufficient_quota|billing|credit|payment/.test(code)) return new AiError("credit_exhausted", { detail: `groq ${status} ${code}` });
  if (status === 429) return new AiError("quota_exceeded", { retryAfterSec, detail: `groq 429 ${code}` });
  if (status === 401 || status === 403 || /invalid_api_key/.test(code)) return new AiError("invalid_key", { detail: `groq ${status}` });
  return new AiError("unavailable", { detail: `groq ${status} ${code}` });
}

export const groqProvider: AiProvider = {
  id: "groq",
  label: "Groq",
  get model() {
    return env().GROQ_MODEL ?? DEFAULT_GROQ_MODEL;
  },
  isConfigured: () => env().AI_PROVIDER === "groq" && !!env().GROQ_API_KEY,
  async complete(messages: ChatMessage[], opts: AiCompletionOptions): Promise<string> {
    const key = env().GROQ_API_KEY;
    if (!key) throw new AiError("not_configured");
    const model = env().GROQ_MODEL ?? DEFAULT_GROQ_MODEL;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        cache: "no-store",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_completion_tokens: opts.maxTokens,
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
          ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
        }),
      });
    } catch (err) {
      throw new AiError("unavailable", { cause: err, detail: "groq network/timeout" });
    } finally {
      clearTimeout(timer);
    }
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) throw mapGroqError(res.status, body, res.headers.get("retry-after"));
    const parsed = responseSchema.safeParse(body);
    const content = parsed.success ? parsed.data.choices[0]!.message.content : null;
    if (!content) throw new AiError("bad_output", { detail: "groq empty content" });
    return content;
  },
};
