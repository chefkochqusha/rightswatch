import Link from "next/link";
import { requireSession } from "@/app/_lib/current-user";
import { canManageCases } from "@/app/_lib/authorize";
import { dataModeFor } from "@/app/_lib/connector-mode";
import { getLibraryStore } from "@/app/_lib/library-store";
import { getWorkspaceScanItems } from "@/app/_lib/workspace-scan-store";
import { PageHeader } from "@/components/ui/page-header";
import { CoverArt } from "@/components/music/cover-art";
import { buttonStyles } from "@/components/ui/button";
import { AlertIcon, ChevronRightIcon, PlusIcon } from "@/components/ui/icons";
import { songRightsSummary } from "@/components/rights/record-summary";
import { SongSearch } from "./song-search";
import { addKnownSongAction } from "./actions";
import { loadDemoDataAction } from "../demo-actions";

export const metadata = {
  title: "Rights Library — RightsWatch",
};

/**
 * The Rights Library (Brief §10): the songs the workspace administers —
 * found by searching, the way a music app finds them — and, per song, what
 * its rights records cover. Every scan checks the creators' commercial
 * posts for these songs and nothing else. Below the catalogue: songs a
 * scan heard in those posts that aren't in it, one click from joining.
 */
export default async function RightsLibraryPage() {
  const session = await requireSession();
  const workspaceId = session.workspace.id;
  const canManage = canManageCases(session.role);
  const library = getLibraryStore();

  const [catalogue, known, records, items] = await Promise.all([
    library.catalog.findCatalogue(workspaceId),
    library.catalog.findAllKnown(workspaceId),
    library.rights.findForWorkspace(workspaceId),
    getWorkspaceScanItems(workspaceId),
  ]);

  const recordsByTrack = groupBy(records, (record) => record.trackId);
  const statsByTrack = new Map<string, { videos: number; flagged: number; unchecked: number }>();
  for (const item of items) {
    if (item.kind !== "ASSESSED" && item.kind !== "OTHER_MUSIC") continue;
    const stats = statsByTrack.get(item.musicMatch.trackId) ?? { videos: 0, flagged: 0, unchecked: 0 };
    stats.videos += 1;
    if (item.kind === "ASSESSED" && item.assessment.status !== "CLEARED") stats.flagged += 1;
    if (item.kind === "OTHER_MUSIC") stats.unchecked += 1;
    statsByTrack.set(item.musicMatch.trackId, stats);
  }
  // Songs with posts nobody checked: never in the catalogue while a scan
  // found them.
  const heard = known
    .filter((track) => !track.inCatalogue && (statsByTrack.get(track.id)?.unchecked ?? 0) > 0)
    .sort((a, b) => (statsByTrack.get(b.id)?.unchecked ?? 0) - (statsByTrack.get(a.id)?.unchecked ?? 0));
  const now = new Date();

  return (
    <div className="space-y-10">
      <PageHeader
        title="Rights Library"
        description="The songs you administer, and what their licences cover. Every scan checks your creators' paid posts for these songs."
      />

      <section aria-labelledby="add-songs" className="max-w-3xl">
        <h2 id="add-songs" className="sr-only">
          Add songs
        </h2>
        <SongSearch canManage={canManage} />
        {canManage && dataModeFor(session.workspace) === "DEMO" && catalogue.length === 0 && (
          <form action={loadDemoDataAction} className="mt-5 rounded-2xl bg-surface-2 px-4 py-3.5">
            <p className="text-[0.8125rem] leading-relaxed text-t2">
              Just looking around? Load the demo data: six fictional songs with their rights records, and 48
              fictional creators whose paid posts use them, scanned straight away.{" "}
              <button type="submit" className="font-medium text-accent hover:underline">
                Load demo data
              </button>
            </p>
          </form>
        )}
      </section>

      <section aria-labelledby="catalogue">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 id="catalogue" className="text-[1.1875rem] font-semibold tracking-[-0.012em]">
            Your catalogue
          </h2>
          {catalogue.length > 0 && (
            <p className="text-[0.8125rem] text-t2 tabular-nums">
              {catalogue.length} {catalogue.length === 1 ? "song" : "songs"}
            </p>
          )}
        </div>

        {catalogue.length === 0 ? (
          <div className="rounded-[1.125rem] border border-dashed border-line px-6 py-12 text-center">
            <p className="text-[1.0625rem] font-semibold tracking-[-0.01em]">Your catalogue is empty.</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-t2">
              Search for the songs you administer and add them. RightsWatch then looks for them in every paid post
              your creators publish.
            </p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-[1.125rem] border border-line bg-surface">
            {catalogue.map((track) => {
              const stats = statsByTrack.get(track.id) ?? { videos: 0, flagged: 0, unchecked: 0 };
              const rights = songRightsSummary(recordsByTrack.get(track.id) ?? [], now);
              return (
                <li key={track.id} className="border-t border-line first:border-t-0">
                  <Link
                    href={`/workspace/rights/${track.id}`}
                    className="group grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-hover sm:grid-cols-[3rem_minmax(0,1.3fr)_minmax(0,1fr)_7rem_1rem] sm:px-5"
                  >
                    <CoverArt title={track.title} artist={track.artist} artworkUrl={track.artworkUrl} className="h-12 w-12 rounded-lg" />
                    <span className="min-w-0">
                      <span className="block truncate text-[0.9375rem] font-medium text-tx">{track.title}</span>
                      <span className="block truncate text-[0.8125rem] text-t2">{track.artist ?? "Unknown artist"}</span>
                    </span>
                    <span
                      className={`col-start-2 row-start-2 truncate text-[0.8125rem] sm:col-start-auto sm:row-start-auto ${rights.missing ? "text-unknown" : "text-t2"}`}
                    >
                      {rights.missing && <AlertIcon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />}
                      {rights.text}
                    </span>
                    <span className="col-start-3 row-span-2 row-start-1 text-right text-[0.8125rem] tabular-nums sm:col-start-auto sm:row-span-1 sm:row-start-auto">
                      <span className="block text-tx">
                        {stats.videos} {stats.videos === 1 ? "video" : "videos"}
                      </span>
                      {stats.flagged > 0 && <span className="block text-mismatch">{stats.flagged} to review</span>}
                    </span>
                    <ChevronRightIcon className="hidden h-4 w-4 text-t2 transition-transform group-hover:translate-x-0.5 sm:block" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {heard.length > 0 && (
        <section aria-labelledby="heard">
          <div className="mb-3">
            <h2 id="heard" className="text-[1.1875rem] font-semibold tracking-[-0.012em]">
              Heard in your creators&apos; posts
            </h2>
            <p className="mt-1 max-w-2xl text-[0.8125rem] leading-relaxed text-t2">
              Songs a scan identified that aren&apos;t in your catalogue, so nobody checked their rights. If you
              administer one, add it: its posts are checked straight away.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {heard.slice(0, 12).map((track) => {
              const videos = statsByTrack.get(track.id)?.unchecked ?? 0;
              return (
                <li key={track.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                  <CoverArt title={track.title} artist={track.artist} artworkUrl={track.artworkUrl} className="h-12 w-12 shrink-0 rounded-lg" />
                  <Link href={`/workspace/rights/${track.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-tx hover:underline">{track.title}</span>
                    <span className="block truncate text-[0.8125rem] text-t2">
                      {track.artist ?? "Unknown artist"}, in {videos} {videos === 1 ? "post" : "posts"}
                    </span>
                  </Link>
                  {canManage && (
                    <form action={addKnownSongAction}>
                      <input type="hidden" name="trackId" value={track.id} />
                      <button type="submit" className={buttonStyles("secondary", "sm")} aria-label={`Add ${track.title} to your catalogue`}>
                        <PlusIcon className="h-3.5 w-3.5" />
                        Add
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return groups;
}

