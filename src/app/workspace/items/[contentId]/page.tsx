import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession, requireSession } from "@/app/_lib/current-user";
import { canManageCases } from "@/app/_lib/authorize";
import { getWorkspaceScanItem } from "@/app/_lib/workspace-scan-store";
import { AssessmentSummary } from "@/components/rights/assessment-summary";
import { StatusBadge } from "@/components/ui/status-badge";
import { CasePanel } from "./case-panel";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

/**
 * A per-item title, same rationale as the Demo Mode counterpart's
 * `generateMetadata` (`assessments/[contentId]/page.tsx`), including the
 * same fix: the not-found branch sets the title explicitly rather than
 * returning `{}`, since an empty object doesn't fall through to
 * `not-found.tsx`'s own title once the page body's `notFound()` throws
 * (verified live against the Demo Mode counterpart — see that file).
 *
 * Uses `getCurrentSession` rather than the page body's own
 * `requireSession` for the no-session case — metadata generation
 * shouldn't be the thing that redirects to `/login`; `{}` there just
 * falls back to no override (the layout's plain "RightsWatch") for the
 * moment before the page body's own `requireSession` redirects away.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ contentId: string }>;
}): Promise<Metadata> {
  const { contentId } = await params;
  const session = await getCurrentSession();
  if (!session) return {};
  const item = await getWorkspaceScanItem(session.workspace.id, contentId);
  if (!item) return { title: "Page not found — RightsWatch" };
  return { title: `@${item.creatorUsername} — RightsWatch` };
}

/**
 * One scanned post: the assessment panel, scoped to the caller's own
 * session and workspace (never another workspace's items), with the case
 * panel alongside it. See `case-panel.tsx`
 * for why a case only ever appears for an `ASSESSED` item.
 */
export default async function WorkspaceItemDetailPage({
  params,
}: {
  params: Promise<{ contentId: string }>;
}) {
  const { contentId } = await params;
  const session = await requireSession();
  const item = await getWorkspaceScanItem(session.workspace.id, contentId);
  if (!item) notFound();

  return (
    <div>
      <Link href="/workspace" className="text-[0.8125rem] text-t2 hover:text-tx">
        ← Back to overview
      </Link>

      <div className="mt-4 mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">@{item.creatorUsername}</h1>
          <p className="mt-1 text-sm text-t2">
            {item.content.brandNames.join(", ") || "Unlabeled brand"} ·{" "}
            {dateFormatter.format(item.content.publishedAt)}
          </p>
        </div>
        {item.kind === "ASSESSED" && <StatusBadge status={item.assessment.status} />}
      </div>

      <AssessmentSummary item={item} />

      <div className="mt-4">
        {item.kind === "ASSESSED" ? (
          <CasePanel
            rightsAssessmentId={item.rightsAssessmentId}
            contentId={contentId}
            currentUserId={session.user.id}
            currentUserName={session.user.name ?? session.user.email}
            canManage={canManageCases(session.role)}
          />
        ) : (
          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold">Case</h2>
            <p className="mt-2 text-sm text-t2">
              A case can be opened once a track has been identified and assessed. This item{" "}
              {item.kind === "NO_MUSIC_MATCH"
                ? "has no identified track yet"
                : "failed music identification"}
              .
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
