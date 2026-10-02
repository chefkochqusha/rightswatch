import Link from "next/link";
import { requireSession } from "@/app/_lib/current-user";
import { canManageCases } from "@/app/_lib/authorize";
import { getWorkspaceScanItems } from "@/app/_lib/workspace-scan-store";
import { getCaseStore } from "@/app/_lib/case-store";
import { getCreatorStore } from "@/app/_lib/creator-store";
import { getCreatorAllowance } from "@/app/_lib/creator-allowance";
import { dataModeFor } from "@/app/_lib/connector-mode";
import { getLibraryStore } from "@/app/_lib/library-store";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonStyles } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import { CoverArt } from "@/components/music/cover-art";
import { DetectionCard, type DetectionSong } from "@/components/feed/detection-card";
import type { StoredScanItem } from "@/modules/scan-results";
import { RunScanButton } from "@/components/scans/run-scan-button";

export const metadata = {
  title: "Overview — RightsWatch",
};

const PAGE_SIZE = 12;
const FILTERS = [
  { key: "all", label: "All" },
  { key: "review", label: "To review" },
  { key: "cleared", label: "Cleared" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

function feedHref({ show, song, limit }: { show: FilterKey; song: string | null; limit?: number }): string {
  const params = new URLSearchParams();
  if (show !== "all") params.set("show", show);
  if (song) params.set("song", song);
  if (limit && limit > PAGE_SIZE) params.set("limit", String(limit));
  const query = params.toString();
  return query ? `/workspace?${query}` : "/workspace";
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <dt className="text-[0.8125rem] text-t2">{label}</dt>
      <dd className={`mt-0.5 text-[1.75rem] leading-none font-semibold tracking-[-0.02em] tabular-nums ${tone ?? "text-tx"}`}>{value}</dd>
    </div>
  );
}

/**
 * The workspace's home: what scans found, most urgent first, and the way
 * to run one. A new workspace gets its first steps instead — a plan, a
 * creator to monitor, a first scan — in the order they're needed.
 */
export default async function WorkspacePage({ searchParams }: PageProps<"/workspace">) {
  const query = await searchParams;
  const session = await requireSession();
  const canManage = canManageCases(session.role);
  const workspaceId = session.workspace.id;

  const [items, creators, allowance, cases, tracks] = await Promise.all([
    getWorkspaceScanItems(workspaceId),
    getCreatorStore().creators.findForWorkspace(workspaceId),
    getCreatorAllowance(workspaceId),
    getCaseStore().cases.findForWorkspace(workspaceId),
    getLibraryStore().catalog.findAllKnown(workspaceId),
  ]);
  const monitored = creators.filter((creator) => creator.monitoringEnabled);
  const caseByAssessment = new Map(cases.map((c) => [c.rightsAssessmentId, c]));

  const now = new Date();
  const isDemo = dataModeFor(session.workspace) === "DEMO";
  const displayNames = new Map(creators.map((creator) => [creator.id, creator.displayName]));
  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const openCases = cases.filter((c) => c.status === "OPEN" || c.status === "IN_PROGRESS").length;

  // The feed is the posts with a song in them, newest first (items arrive
  // newest first). Posts with no song identified are counted, not listed.
  const isMatched = (item: StoredScanItem) => item.kind === "ASSESSED" || item.kind === "OTHER_MUSIC";
  const isToReview = (item: StoredScanItem) => item.kind === "ASSESSED" && item.assessment.status !== "CLEARED";
  const matched = items.filter(isMatched);
  const toReview = matched.filter(isToReview);

  const filter: FilterKey = FILTERS.find((f) => f.key === query.show)?.key ?? "all";
  const songFilter = typeof query.song === "string" && trackById.has(query.song) ? query.song : null;
  const activeSong = songFilter ? trackById.get(songFilter) : null;
  const requestedLimit = Number(typeof query.limit === "string" ? query.limit : PAGE_SIZE);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), PAGE_SIZE), 240) : PAGE_SIZE;

  const trackIdOf = (item: StoredScanItem) => (isMatched(item) && "musicMatch" in item ? item.musicMatch.trackId : null);
  const feed = matched.filter((item) => {
    if (songFilter && trackIdOf(item) !== songFilter) return false;
    if (filter === "review") return isToReview(item);
    if (filter === "cleared") return item.kind === "ASSESSED" && item.assessment.status === "CLEARED";
    return true;
  });
  const visible = feed.slice(0, limit);

  const songFor = (item: StoredScanItem): DetectionSong | null => {
    const id = trackIdOf(item);
    const track = id ? trackById.get(id) : null;
    return track ? { title: track.title, artist: track.artist, artworkUrl: track.artworkUrl, inCatalogue: track.inCatalogue } : null;
  };

  const songRail = tracks
    .map((track) => {
      const mine = matched.filter((item) => trackIdOf(item) === track.id);
      return { track, posts: mine.length, review: mine.filter(isToReview).length };
    })
    .filter((entry) => entry.posts > 0)
    .sort((a, b) => b.review - a.review || b.posts - a.posts)
    .slice(0, 12);

  const steps = [
    { done: allowance.cap > 0, label: "Choose a plan", detail: "Every plan starts with a free 14-day trial.", href: "/workspace/billing" },
    { done: monitored.length > 0, label: "Add the creators to monitor", detail: "Their TikTok usernames are enough.", href: "/workspace/creators" },
    { done: items.length > 0, label: "Run your first scan", detail: "It checks their commercial posts for your music.", href: null },
  ];
  const nextStep = steps.findIndex((step) => !step.done);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description={
          monitored.length === 0
            ? `${session.workspace.name} isn't monitoring anyone yet.`
            : `What RightsWatch found across the ${monitored.length === 1 ? "creator" : `${monitored.length} creators`} ${session.workspace.name} monitors.`
        }
        actions={canManage && allowance.cap > 0 && monitored.length > 0 ? <RunScanButton creatorCount={Math.min(monitored.length, allowance.cap)} /> : undefined}
      />

      {nextStep !== -1 && (
        <section className="rounded-[1.125rem] border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-[1.0625rem] font-semibold tracking-[-0.01em]">Get started</h2>
          <ol className="mt-4 space-y-3">
            {steps.map((step, index) => (
              <li key={step.label} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                    step.done ? "bg-cleared-bg text-cleared" : index === nextStep ? "bg-accent text-white" : "bg-hover text-t2"
                  }`}
                >
                  {step.done ? <CheckIcon className="h-3 w-3" /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${step.done ? "text-t2 line-through decoration-t2/40" : "text-tx"}`}>
                    {step.label}
                    {step.done && <span className="sr-only"> (done)</span>}
                  </p>
                  {!step.done && <p className="text-[0.8125rem] text-t2">{step.detail}</p>}
                </div>
                {index === nextStep && step.href && canManage && (
                  <Link href={step.href} className={buttonStyles("primary", "sm")}>
                    {step.label}
                  </Link>
                )}
              </li>
            ))}
          </ol>
          {!canManage && <p className="mt-4 text-[0.8125rem] text-t2">An owner, admin or analyst sets these up.</p>}
        </section>
      )}

      {matched.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-5">
          <Kpi label="Creators monitored" value={monitored.length} />
          <Kpi label="Videos checked" value={items.length} />
          <Kpi label="Music matches" value={matched.length} />
          <Kpi label="To review" value={toReview.length} tone={toReview.length > 0 ? "text-mismatch" : undefined} />
          <Kpi label="Open cases" value={openCases} />
        </dl>
      )}

      {songRail.length > 0 && (
        <section aria-labelledby="songs-heading">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="songs-heading" className="text-[1.0625rem] font-semibold tracking-[-0.01em]">Your songs in the feed</h2>
            <Link href="/workspace/rights" className="text-[0.8125rem] font-medium text-accent hover:underline">Rights Library</Link>
          </div>
          <ul className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-2 sm:-mx-0 sm:px-0">
            {songRail.map(({ track, posts, review }) => {
              const active = track.id === songFilter;
              return (
                <li key={track.id} className="shrink-0">
                  <Link
                    href={feedHref({ show: filter, song: active ? null : track.id })}
                    aria-current={active ? "true" : undefined}
                    className={`flex w-[12.5rem] items-center gap-3 rounded-2xl border p-2.5 transition-colors ${active ? "border-accent bg-accent/8" : "border-line bg-surface hover:border-black/15"}`}
                  >
                    <CoverArt title={track.title} artist={track.artist} artworkUrl={track.artworkUrl} className="h-11 w-11 shrink-0 rounded-lg" />
                    <span className="min-w-0">
                      <span className="block truncate text-[0.875rem] font-medium text-tx">{track.title}</span>
                      <span className="block truncate text-[0.75rem] text-t2">
                        {posts} {posts === 1 ? "video" : "videos"}
                        {review > 0 && <span className="text-mismatch"> · {review} to review</span>}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="feed-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="feed-heading" className="text-[1.0625rem] font-semibold tracking-[-0.01em]">
            {activeSong ? `Videos with ${activeSong.title}` : "Latest videos with music"}
          </h2>
          <nav aria-label="Filter the feed" className="flex gap-1 rounded-full bg-hover p-1">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={feedHref({ show: f.key, song: songFilter })}
                aria-current={filter === f.key ? "true" : undefined}
                className={`rounded-full px-3 py-1 text-[0.8125rem] font-medium transition-colors ${filter === f.key ? "bg-surface text-tx shadow-sm" : "text-t2 hover:text-tx"}`}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        </div>

        {feed.length === 0 ? (
          <div className="mt-4 rounded-[1.125rem] border border-line bg-surface">
            <EmptyState
              title={matched.length === 0 ? "No music matches yet." : "Nothing here with this filter."}
              description={
                matched.length === 0
                  ? "Once a scan finds commercial posts by the creators you monitor, they show up here as a feed, newest first, with what the rights check says about each one."
                  : "Try another filter, or pick a different song."
              }
            />
          </div>
        ) : (
          <>
            <ul className="mt-4 grid gap-3 xl:grid-cols-2">
              {visible.map((item) => (
                <li key={item.content.externalContentId} className="min-w-0">
                  <DetectionCard
                    item={item}
                    song={songFor(item)}
                    creatorDisplayName={displayNames.get(item.creatorId) ?? null}
                    caseStatus={item.rightsAssessmentId ? (caseByAssessment.get(item.rightsAssessmentId)?.status ?? null) : null}
                    isDemo={isDemo}
                    now={now}
                  />
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-center justify-between gap-3 text-[0.8125rem] text-t2">
              <p>Showing {visible.length} of {feed.length}</p>
              {visible.length < feed.length && (
                <Link href={feedHref({ show: filter, song: songFilter, limit: limit + PAGE_SIZE })} scroll={false} className={buttonStyles("secondary", "sm")}>
                  Show more
                </Link>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
