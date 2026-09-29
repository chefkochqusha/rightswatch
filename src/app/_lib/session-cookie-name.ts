/**
 * Shared between `session-cookie.ts` (which reads/writes cookies via the
 * `next/headers` `cookies()` API, for Server Components and Actions) and
 * `proxy.ts` (which reads cookies via `NextRequest.cookies` instead,
 * since Proxy gets a request object, not the ambient `cookies()` helper)
 * so the cookie name is never duplicated as a magic string that could
 * silently drift between the two.
 */
export const SESSION_COOKIE_NAME = "session";
