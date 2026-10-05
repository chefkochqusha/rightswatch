/**
 * The Content-Security-Policy every page gets (set per request in `proxy.ts`,
 * because the script nonce must be new for each response — Next.js docs,
 * "Content Security Policy").
 *
 * What it does: scripts run only if they carry this request's nonce (and the
 * scripts those load), so markup injected into a page can't execute; nothing
 * may be framed, embedded as an object, or sent to another origin by a form
 * except Stripe's own pages. Styles allow inline: React sets `style="…"` on
 * elements, which a nonce can't cover, and a style can't run code.
 *
 * Development needs `unsafe-eval` (React's debugging) and a WebSocket for hot
 * reload; production needs neither.
 */
export function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

/** A fresh, unguessable nonce (base64) — one per request. */
export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
