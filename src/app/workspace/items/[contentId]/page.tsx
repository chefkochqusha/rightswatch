import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession, requireSession } from "@/app/_lib/current-user";
import { canManageCases } from "@/app/_lib/authorize";
import { getWorkspaceScanItem } from "@/app/_lib/workspace-scan-store";
import { AssessmentSummary } from "@/components/rights/assessment-summary";
import { StatusBadge } from "@/components/ui/status-badge";
import { getLibraryStore } from "@/app/_lib/library-store";
import { CasePanel } from "./case-panel";
import { IdentifyForm } from "./identify-form";
import { RejectSongForm } from "./reject-song-form";
import { PostAudioCheck } from "@/components/recognition/post-audio-check";
import { isOwnRecognitionEnabled } from "@/app/_lib/own-recognition";
import { DEMO_WORKSPACE_SLUG } from "@/app/_lib/demo-constants";

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
 * falls back to no override (the layout's plain "Bekvor") for the
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
  if (!item) return { title: "Page not found — Bekvor" };
  return { title: `@${item.creatorUsername} — Bekvor` };
}

/**
 * One scanned post: the assessment panel, scoped to the caller's own
 * session and workspace (never another workspace's items), with the case
 * panel alongside it. See `case-panel.tsx`
 * for why a case only ever appears for an `ASSESSED` item.
 */
export default async function WorkspaceItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ contentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { contentId } = await params;
  const justAdded = (await searchParams).added === "1";
  const session = await requireSession();
  const item = await getWorkspaceScanItem(session.workspace.id, contentId);
  if (!item) notFound();
  const catalogue = item.kind === "ASSESSED" ? [] : await getLibraryStore().catalog.findCatalogue(session.workspace.id);
  const songOptions = catalogue.map((track) => ({ id: track.id, label: track.artist ? `${track.title} — ${track.artist}` : track.title }));
  const showAudioCheck = isOwnRecognitionEnabled() && session.workspace.slug !== DEMO_WORKSPACE_SLUG;

  return (
    <div>
      <Link href="/workspace" className="text-[0.8125rem] text-t2 hover:text-tx">
        ← Back to overview
      </Link>

      <div className="mt-4 mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[2.25rem] leading-[1.05] font-extrabold tracking-[-0.03em]">@{item.creatorUsername}</h1>
          <p className="mt-1 text-sm text-t2">
            {item.content.brandNames.join(", ") || "Unlabeled brand"} ·{" "}
            {dateFormatter.format(item.content.publishedAt)}
          </p>
        </div>
        {item.kind === "ASSESSED" && <StatusBadge status={item.assessment.status} />}
      </div>

      {justAdded && (item.kind === "NO_MUSIC_MATCH" || item.kind === "MUSIC_ID_ERROR") && (
        <p role="status" className="mb-4 rounded-[0.875rem] border border-line bg-surface px-4 py-3 text-sm">
          Post added. Next, say which of your songs it uses{showAudioCheck ? ", or upload its audio below" : ""}.
        </p>
      )}

      <AssessmentSummary item={item} />
      {(item.kind === "ASSESSED" || item.kind === "OTHER_MUSIC") && canManageCases(session.role) && session.workspace.slug !== DEMO_WORKSPACE_SLUG && (
        <RejectSongForm contentId={contentId} title={item.musicMatch.title} hasCase={item.kind === "ASSESSED"} />
      )}

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
            <h2 className="text-sm font-semibold">{item.kind === "OTHER_MUSIC" ? "Case" : "Song in this post"}</h2>
            <p className="mt-2 text-sm text-t2">
              {item.kind === "OTHER_MUSIC"
                ? "A song was identified, but it isn't in your library, so there is nothing to check it against. Add it in the Rights Library and this post is checked."
                : item.kind === "NO_MUSIC_MATCH"
                  ? "No song was identified in this post."
                  : "Identifying the song in this post didn't complete."}{" "}
              {item.kind !== "OTHER_MUSIC" && "If you know which of your songs it uses, say so and the rights check runs."}
            </p>
            {item.kind !== "OTHER_MUSIC" && canManageCases(session.role) && catalogue.length > 0 && (
              <IdentifyForm contentId={contentId} songs={songOptions} />
            )}
            {item.kind !== "OTHER_MUSIC" && canManageCases(session.role) && catalogue.length === 0 && (
              <p className="mt-3 text-sm text-t2">
                Your library has no songs yet. <Link href="/workspace/rights" className="font-medium text-accent hover:underline">Add one in the Rights Library</Link> first.
              </p>
            )}
          </section>
        )}
      </div>

      {showAudioCheck && (
        <PostAudioCheck
          workspaceId={session.workspace.id}
          externalContentId={contentId}
          canManage={canManageCases(session.role)}
          needsSong={item.kind === "NO_MUSIC_MATCH" || item.kind === "MUSIC_ID_ERROR"}
          catalogue={songOptions}
        />
      )}
    </div>
  );
}
