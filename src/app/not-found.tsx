import Link from "next/link";

export const metadata = {
  title: "Page not found — RightsWatch",
};

/**
 * App-wide 404 (Next.js App Router `not-found.js` convention — see
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`).
 * A root `not-found.tsx` handles both of this app's real `notFound()` call
 * sites — `assessments/[contentId]/page.tsx` (Demo Mode) and
 * `workspace/items/[contentId]/page.tsx` (the real workspace) — and, per
 * that same doc, any URL that doesn't match a route at all.
 *
 * There's no route-group split between Demo Mode and the workspace (see
 * ARCHITECTURE.md), so this one page has to serve both contexts.
 * Deliberately doesn't check the session to pick a smarter "back" link:
 * this file sits at the root of every route, and reading the session cookie
 * here (a dynamic API) would force every other page in the app — including
 * the ones `generateStaticParams`/`generateMetadata` prerender today — into
 * dynamic rendering too, since they all share this same not-found boundary.
 * `/` always sends visitors to `/dashboard` regardless of session for the
 * same reason (see `app/page.tsx`), so this just follows that precedent.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
      <p className="text-sm font-semibold text-t2">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-tx">Page not found</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-t2">
        The page you&rsquo;re looking for doesn&rsquo;t exist, or may have been moved.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-full bg-tx px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
