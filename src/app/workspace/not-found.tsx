import Link from "next/link";

/**
 * 404 inside the app (Next.js `not-found.js` convention): a `notFound()` call
 * from a page under /workspace — a content, creator or track id that doesn't
 * exist in this workspace — renders this inside the workspace layout, so the
 * navigation stays and the way back is one click.
 */
export default function WorkspaceNotFound() {
  return (
    <div className="py-16 text-center">
      <p className="text-sm font-semibold text-t2">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-tx">Not found</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-t2">
        This item doesn&rsquo;t exist in your workspace, or it was removed.
      </p>
      <Link
        href="/workspace"
        className="mt-6 inline-block rounded-full bg-tx px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
      >
        Back to overview
      </Link>
    </div>
  );
}
