/**
 * A link that came from outside (a TikTok API answer, a stored post) is only
 * ever followed or handed on when it is a plain https address: no
 * `javascript:` or `data:` links in an `href`, no `file:` or `http://10.0.0.1`
 * style address handed to a service that fetches it for us, no
 * `user:password@` part. Returns the normalised address, or null.
 */
const MAX_URL_LENGTH = 2048;

export function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (url.hostname === "") return null;
  return url.href;
}
