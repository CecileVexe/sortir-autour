import { env } from "@/lib/env";
import { groqProvider } from "@/lib/ai/groq";
import { AiError, type AiProvider } from "@/lib/ai/types";

/** Registry: add other providers here (same interface). */
const PROVIDERS: Record<string, AiProvider> = { groq: groqProvider };

export function getAiProvider(): AiProvider | null {
  const id = env().AI_PROVIDER;
  if (id === "none") return null;
  const p = PROVIDERS[id];
  return p && p.isConfigured() ? p : null;
}

export function requireAiProvider(): AiProvider {
  const p = getAiProvider();
  if (!p) throw new AiError("not_configured");
  return p;
}

/** Extracts the first JSON object from a model answer (some models wrap it in prose or fences). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new AiError("bad_output", { detail: "no json object" });
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch (err) {
    throw new AiError("bad_output", { cause: err, detail: "invalid json" });
  }
}

/** Removes URLs and control characters from model text: the AI must never introduce links. */
export function sanitizeAiText(s: string, max: number): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "")
    .replace(/[\u0000-\u001f\u007f<>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
