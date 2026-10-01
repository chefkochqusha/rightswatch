import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/modules/auth";
import { SESSION_COOKIE_NAME } from "@/app/_lib/session-cookie-name";

/**
 * Optimistic auth checks only (Next.js App Router guide, "Authorization" >
 * "Optimistic checks with Proxy" — file convention renamed from
 * `middleware.ts` to `proxy.ts` in Next.js 16, see AGENTS.md): decode the
 * signed session cookie and redirect, but never touch a repository here —
 * Proxy runs on every request including prefetches, so it must stay fast.
 * The real, secure check (confirming the user and membership still exist)
 * lives in `app/_lib/current-user.ts`'s `requireSession()`, called by the
 * `/workspace` page itself. Server Actions must not rely on this file
 * alone either — a matcher change can silently exclude them (see the
 * proxy.js reference doc, "Execution order") — so `signUp`/`logIn` never
 * assume a request already passed through here.
 *
 * Demo Mode (`/`, `/dashboard`, `/creators`, `/assessments/*`) is
 * deliberately public and untouched here — it exists precisely so a
 * prospect can see the product with no signup at all (Phase 6).
 *
 * `/invite/accept` is also public and deliberately absent from
 * `AUTH_PAGES`: unlike `/login`/`/signup`, an existing session doesn't
 * satisfy it — accepting an invite always creates a brand-new, unrelated
 * account (`modules/auth/accept-invite.ts`), so a logged-in browser opening
 * an invite link should still see the accept form, not get bounced to its
 * current, different workspace.
 */
const PROTECTED_PREFIXES = ["/workspace"];
const AUTH_PAGES = ["/login", "/signup"];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = process.env.SESSION_SECRET;
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  // Fail safe if SESSION_SECRET isn't configured yet: treat as "no
  // session" rather than throwing and taking down every route, including
  // the public Demo Mode pages that don't need auth at all.
  const session = cookie && secret ? verifySessionToken(cookie, secret) : null;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isProtected && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // A validly signed cookie can still name a session that's over (logged
  // out elsewhere, or its account is gone) — this file can't tell without a
  // database, `requireSession()` can. When it sends a browser here with
  // `?expired=1`, let the login page render instead of bouncing back to
  // `/workspace`, which would loop.
  if (AUTH_PAGES.includes(pathname) && session && !request.nextUrl.searchParams.has("expired") && !request.nextUrl.searchParams.has("reset")) {
    return NextResponse.redirect(new URL("/workspace", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
