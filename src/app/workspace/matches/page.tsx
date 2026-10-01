import Link from "next/link";
import { requireSession } from "@/app/_lib/current-user";
import { getLibraryStore } from "@/app/_lib/library-store";
import { getWorkspaceScanItems } from "@/app/_lib/workspace-scan-store";
import { CoverArt } from "@/components/music/cover-art";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatRelativeTime } from "@/components/ui/time";
import { summarizeSongMatches } from "@/modules/scan-results";

export const metadata = {
  title: "Music Matches — RightsWatch",
};

const SCOPES = [
  { key: "all", label: "All songs" },
  { key: "library", label: "In your library" },
  { key: "outside", label: "Not in your library" },
] as const;
type ScopeKey = (typeof SCOPES)[number]["key"];

function Count({ n, label, tone }: { n: number; label: string; tone: string }) {
  if (n === 0) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tone}`}>
      {n} {label}
    </span>
  );
}

/**
 * Music Matches (Brief §6): every song the scans identified in watched
 * creators' paid posts, with how often it turns up and what the rights
 * check made of those posts. A song heard that isn't in the library yet
 * shows here too, because that is how a missing song gets noticed. Each
 * row opens the song, with the posts that use it.
 */
export default async function MatchesPage({ searchParams }: PageProps<"/workspace/matches">) {
  const query = await searchParams;
  const session = await requireSession();
  const workspaceId = session.workspace.id;

  const [items, tracks] = await Promise.all([getWorkspaceScanItems(workspaceId), getLibraryStore().catalog.findAllKnown(workspaceId)]);
  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const summaries = summarizeSongMatches(items).filter((summary) => trackById.has(summary.trackId));

  const scope: ScopeKey = SCOPES.find((s) => s.key === query.scope)?.key ?? "all";
  const rows = summaries.filter((summary) => {
    const inCatalogue = trackById.get(summary.trackId)!.inCatalogue;
    return scope === "all" || (scope === "library" ? inCatalogue : !inCatalogue);
  });
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader title="Music Matches" description="Songs the scans found in your creators' paid posts, and what the rights check says about them." />

      {summaries.length === 0 ? (
        <section className="rounded-[1.125rem] border border-line bg-surface">
          <EmptyState
            title="No songs found yet"
            description="Once a scan has run over the creators you monitor, the songs it identifies in their paid posts are listed here."
          >
            <Link href="/workspace" className={buttonStyles("primary", "md")}>
              Go to the overview
            </Link>
          </EmptyState>
        </section>
      ) : (
        <>
          <nav aria-label="Songs to show" className="inline-flex rounded-full bg-hover p-1 text-[0.8125rem] font-medium">
            {SCOPES.map((s) => (
              <Link
                key={s.key}
                href={s.key === "all" ? "/workspace/matches" : `/workspace/matches?scope=${s.key}`}
                aria-current={scope === s.key ? "page" : undefined}
                className={`rounded-full px-3.5 py-1.5 ${scope === s.key ? "bg-bg text-tx shadow-sm" : "text-t2 hover:text-tx"}`}
              >
                {s.label}
              </Link>
            ))}
          </nav>

          {rows.length === 0 ? (
            <p className="text-sm text-t2">No songs in this view.</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-[1.125rem] border border-line bg-surface">
              {rows.map((summary) => {
                const track = trackById.get(summary.trackId)!;
                return (
                  <li key={summary.trackId}>
                    <Link href={`/workspace/rights/${track.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 hover:bg-hover sm:px-5">
                      <CoverArt title={track.title} artist={track.artist} artworkUrl={track.artworkUrl} className="h-12 w-12 shrink-0 rounded-lg" />
                      <span className="min-w-0 flex-1 basis-48">
                        <span className="block truncate text-[0.9375rem] font-medium text-tx">{track.title}</span>
                        <span className="block truncate text-[0.8125rem] text-t2">
                          {track.artist ?? "Unknown artist"}
                          {!track.inCatalogue && <span className="ml-2 rounded-full bg-unknown-bg px-2 py-0.5 text-xs font-medium text-unknown">Not in your library</span>}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Count n={summary.potentialMismatch} label="potential mismatch" tone="bg-mismatch-bg text-mismatch" />
                        <Count n={summary.review + summary.unknown} label="to review" tone="bg-review-bg text-review" />
                        <Count n={summary.cleared} label="cleared" tone="bg-cleared-bg text-cleared" />
                      </span>
                      <span className="w-full shrink-0 text-[0.8125rem] text-t2 sm:w-40 sm:text-right">
                        {summary.posts} {summary.posts === 1 ? "post" : "posts"} · {summary.creators} {summary.creators === 1 ? "creator" : "creators"}
                        <span className="block text-xs">latest {formatRelativeTime(summary.lastPostAt, now)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
