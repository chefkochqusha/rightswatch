import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDemoAssessmentByContentId, getDemoSnapshot } from "@/app/_lib/get-demo-scan-results";
import { AppHeader } from "@/components/layout/app-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { AssessmentSummary } from "@/components/rights/assessment-summary";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

export async function generateStaticParams() {
  const { items } = await getDemoSnapshot();
  return items.map((row) => ({ contentId: row.content.externalContentId }));
}

/**
 * A per-item title — otherwise every one of these pages shares the same
 * tab title, which stops helping the moment you have more than one open.
 *
 * The not-found case sets the title explicitly (matching `not-found.tsx`'s
 * own `metadata.title` verbatim) rather than returning `{}` and assuming
 * that file's title takes over: verified live (Playwright against the dev
 * server) that when a page defines its own `generateMetadata`, an empty
 * object here does NOT fall through to the `not-found.tsx` boundary's
 * title once `notFound()` throws — it resolves to the root layout's plain
 * "RightsWatch" instead. Keep this in sync with `not-found.tsx` if that
 * title ever changes.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ contentId: string }>;
}): Promise<Metadata> {
  const { contentId } = await params;
  const row = await getDemoAssessmentByContentId(contentId);
  if (!row) return { title: "Page not found — RightsWatch" };
  return { title: `@${row.creator.handle} — RightsWatch` };
}

export default async function AssessmentDetailPage({
  params,
}: {
  params: Promise<{ contentId: string }>;
}) {
  const { contentId } = await params;
  const row = await getDemoAssessmentByContentId(contentId);
  if (!row) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />

      <main className="mx-auto w-full max-w-(--content-width) flex-1 px-6 py-8 [--content-width:1100px]">
        <Link href="/dashboard" className="text-[0.8125rem] text-t2 hover:text-tx">
          ← Back to dashboard
        </Link>

        <div className="mt-4 mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              @{row.creator.handle}
            </h1>
            <p className="mt-1 text-sm text-t2">
              {row.content.brandNames.join(", ") || "Unlabeled brand"} ·{" "}
              {dateFormatter.format(row.content.publishedAt)}
            </p>
          </div>
          {row.kind === "ASSESSED" && <StatusBadge status={row.assessment.status} />}
        </div>

        <AssessmentSummary item={row} />
      </main>
    </div>
  );
}
