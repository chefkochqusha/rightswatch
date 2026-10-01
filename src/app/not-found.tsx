import Link from "next/link";

export const metadata = {
  title: "Page not found — RightsWatch",
};

/**
 * App-wide 404 (Next.js App Router `not-found.js` convention — see
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`).
 * It handles the `notFound()` call in `workspace/items/[contentId]/page.tsx`
 * and any URL that doesn't match a route.
 *
 * Deliberately doesn't read the session to pick a smarter "back" link: that
 * is a dynamic API, and this boundary is shared by every route. `/` is the
 * public landing page for everyone, so the link goes there.
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
        href="/"
        className="mt-6 rounded-full bg-tx px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
      >
        Back to the start
      </Link>
    </div>
  );
}
