/**
 * Validates external URLs before rendering them as links or images.
 * Only http(s) URLs with a public-looking host are accepted; everything else becomes null.
 */
export function safeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s || s.length > 2048) return null;
  if (/^www\./i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return null;
  return u.toString();
}

/** Hosts allowed for <Image> optimisation (must match next.config.ts remotePatterns). */
const IMAGE_HOSTS = new Set(["upload.wikimedia.org", "commons.wikimedia.org", "img.openagenda.com"]);

export function isOptimizableImageHost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && IMAGE_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

export function hostLabel(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
