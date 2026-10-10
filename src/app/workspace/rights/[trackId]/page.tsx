import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession, requireSession } from "@/app/_lib/current-user";
import { canManageCases } from "@/app/_lib/authorize";
import { dataModeFor } from "@/app/_lib/connector-mode";
import { getLibraryStore } from "@/app/_lib/library-store";
import { getScanResultStore } from "@/app/_lib/scan-result-store";
import { getCaseStore } from "@/app/_lib/case-store";
import { getCreatorStore } from "@/app/_lib/creator-store";
import { CoverArt } from "@/components/music/cover-art";
import { DetectionCard } from "@/components/feed/detection-card";
import { buttonStyles } from "@/components/ui/button";
import { ChevronLeftIcon, PlusIcon } from "@/components/ui/icons";
import {
  RECORD_STATE_LABELS,
  describeTerm,
  describeTerritory,
  describeUsage,
  recordState,
} from "@/components/rights/record-summary";
import { toFormDay } from "@/modules/rights";
import type { TrackSource } from "@/modules/catalog";
import { RightsRecords, type RightsRecordView } from "./rights-records";
import { SongDetailsForm } from "./song-details-form";
import { addKnownSongAction, removeSongAction } from "../actions";
import { ReferenceAudio } from "@/components/recognition/reference-audio";
import { isOwnRecognitionEnabled } from "@/app/_lib/own-recognition";
import { DEMO_WORKSPACE_SLUG } from "@/app/_lib/demo-constants";

export async function generateMetadata({ params }: PageProps<"/workspace/rights/[trackId]">): Promise<Metadata> {
  const { trackId } = await params;
  const session = await getCurrentSession();
  if (!session) return {};
  const track = await getLibraryStore().catalog.findById(session.workspace.id, trackId);
  return { title: track ? `${track.title} — Bekvor` : "Page not found — Bekvor" };
}

const SOURCE_LABELS: Record<TrackSource, string> = {
  musicbrainz: "Added from MusicBrainz",
  manual: "Added by hand",
  demo: "Demo catalogue",
  identified: "Heard in a creator's post",
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "review", label: "To review" },
  { key: "cleared", label: "Cleared" },
] as const;

/**
 * One song (Brief §10): what it is, what its licences cover — editable
 * right here — and every commercial post Bekvor found it in, with the
 * verdict on each. A song that isn't in the catalogue (one a scan heard,
 * or one taken out) shows its posts, unchecked, and how to add it.
 */
export default async function SongPage({ params, searchParams }: PageProps<"/workspace/rights/[trackId]">) {
  const { trackId } = await params;
  const query = await searchParams;
  const session = await requireSession();
  const workspaceId = session.workspace.id;
  const canManage = canManageCases(session.role);
  const library = getLibraryStore();

  const track = await library.catalog.findById(workspaceId, trackId);
  if (!track) notFound();

  const [records, campaigns, items, cases, creators] = await Promise.all([
    library.rights.findForTrack(workspaceId, track.id),
    library.campaigns.findForWorkspace(workspaceId),
    getScanResultStore().results.findForTrack(workspaceId, track.id),
    getCaseStore().cases.findForWorkspace(workspaceId),
    getCreatorStore().creators.findForWorkspace(workspaceId),
  ]);

  const now = new Date();
  const campaignNames = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));
  const recordViews: RightsRecordView[] = records.map((record) => {
    const state = recordState(record, now);
    return {
      id: record.id,
      commercial: record.commercial,
      organic: record.organic,
      territories: record.territories,
      startDay: toFormDay(record.startDate),
      endDay: toFormDay(record.endDate),
      campaignIds: record.campaignIds,
      notes: record.notes,
      source: record.source,
      usage: describeUsage(record),
      territory: describeTerritory(record),
      term: describeTerm(record),
      campaignNames: record.campaignIds.map((id) => campaignNames.get(id) ?? "A deleted campaign"),
      state,
      stateLabel: RECORD_STATE_LABELS[state],
    };
  });

  const caseByAssessment = new Map(cases.map((c) => [c.rightsAssessmentId, c]));
  const displayNames = new Map(creators.map((creator) => [creator.id, creator.displayName]));
  const toReview = items.filter((item) => item.kind === "ASSESSED" && item.assessment.status !== "CLEARED");
  const cleared = items.filter((item) => item.kind === "ASSESSED" && item.assessment.status === "CLEARED");
  const filter = FILTERS.find((f) => f.key === query.show)?.key ?? "all";
  const shown = filter === "review" ? toReview : filter === "cleared" ? cleared : items;
  const isDemo = dataModeFor(session.workspace) === "DEMO";
  const song = { title: track.title, artist: track.artist, artworkUrl: track.artworkUrl, inCatalogue: track.inCatalogue };
  const facts = [
    track.album,
    track.durationMs ? formatDuration(track.durationMs) : null,
    track.isrc ? `ISRC ${track.isrc}` : null,
    SOURCE_LABELS[track.source],
  ].filter((fact): fact is string => Boolean(fact));

  return (
    <div className="space-y-10">
      <div>
        <Link href="/workspace/rights" className="inline-flex items-center gap-1 text-[0.8125rem] text-t2 hover:text-tx">
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Rights Library
        </Link>

        <header className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-end">
          <CoverArt
            title={track.title}
            artist={track.artist}
            artworkUrl={track.artworkUrl}
            className="h-32 w-32 shrink-0 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] sm:h-40 sm:w-40"
          />
          <div className="min-w-0">
            <h1 className="font-display text-[2rem] leading-[1.05] font-extrabold tracking-[-0.03em] text-tx sm:text-[2.5rem]">{track.title}</h1>
            <p className="mt-1 text-[1.0625rem] text-tx/80">{track.artist ?? "Unknown artist"}</p>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-t2">
              {facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>
        </header>

        <dl className="mt-8 grid max-w-xl grid-cols-3 gap-6">
          <Stat label={items.length === 1 ? "Post found" : "Posts found"} value={items.length} />
          <Stat label="To review" value={toReview.length} tone={toReview.length > 0 ? "text-mismatch" : undefined} />
          <Stat label="Cleared" value={cleared.length} />
        </dl>
      </div>

      {!track.inCatalogue && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-unknown-bg px-5 py-4">
          <p className="max-w-xl text-sm text-unknown">
            This song isn&apos;t in your catalogue, so its posts aren&apos;t checked against any rights. Add it if you
            administer it.
          </p>
          {canManage && (
            <form action={addKnownSongAction}>
              <input type="hidden" name="trackId" value={track.id} />
              <button type="submit" className={buttonStyles("primary", "sm")}>
                <PlusIcon className="h-3.5 w-3.5" />
                Add to catalogue
              </button>
            </form>
          )}
        </section>
      )}

      {track.inCatalogue && (
        <section aria-labelledby="rights">
          <div className="mb-4 max-w-2xl">
            <h2 id="rights" className="text-[1.1875rem] font-semibold tracking-[-0.012em]">
              Rights
            </h2>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-t2">
              What the licences for this song cover. A post is cleared when a record in force on the day it was
              published covers its use, its country and its campaign.
            </p>
          </div>
          <RightsRecords
            trackId={track.id}
            records={recordViews}
            campaigns={campaigns.map(({ id, name }) => ({ id, name }))}
            canManage={canManage}
          />
        </section>
      )}

      {track.inCatalogue && isOwnRecognitionEnabled() && (
        <ReferenceAudio workspaceId={workspaceId} trackId={track.id} canManage={canManage && session.workspace.slug !== DEMO_WORKSPACE_SLUG} />
      )}

      <section aria-labelledby="posts">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="posts" className="text-[1.1875rem] font-semibold tracking-[-0.012em]">
              Paid posts using this song
            </h2>
            <p className="mt-1 text-[0.8125rem] text-t2">Newest first.</p>
          </div>
          {items.length > 0 && (
            <nav aria-label="Filter posts" className="flex gap-1 rounded-full bg-surface-2 p-1">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={f.key === "all" ? `/workspace/rights/${track.id}` : `/workspace/rights/${track.id}?show=${f.key}`}
                  aria-current={filter === f.key ? "page" : undefined}
                  scroll={false}
                  className={`rounded-full px-3 py-1 text-[0.8125rem] font-medium transition-colors ${
                    filter === f.key ? "bg-surface text-tx shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-t2 hover:text-tx"
                  }`}
                >
                  {f.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        {shown.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-sm text-t2">
            {items.length === 0
              ? "No paid posts using this song yet. Each scan checks your creators' new posts for it."
              : filter === "review"
                ? "Nothing to review for this song."
                : "No cleared posts for this song."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {shown.map((item) => (
              <DetectionCard
                key={item.content.externalContentId}
                item={item}
                song={song}
                creatorDisplayName={displayNames.get(item.creatorId) ?? null}
                caseStatus={item.rightsAssessmentId ? (caseByAssessment.get(item.rightsAssessmentId)?.status ?? null) : null}
                showSong={false}
                isDemo={isDemo}
                now={now}
              />
            ))}
          </div>
        )}
      </section>

      {track.inCatalogue && (
        <section aria-labelledby="details" className="max-w-3xl">
          <h2 id="details" className="text-[1.1875rem] font-semibold tracking-[-0.012em]">
            Catalogue details
          </h2>
          <p className="mt-1 mb-4 text-[0.8125rem] text-t2">For your records. Scans don&apos;t use them.</p>
          {canManage ? (
            <SongDetailsForm
              trackId={track.id}
              details={{
                catalogueId: track.catalogueId,
                rightsOwner: track.rightsOwner,
                publisher: track.publisher,
                label: track.label,
                notes: track.notes,
              }}
            />
          ) : (
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              {(
                [
                  ["Catalogue ID", track.catalogueId],
                  ["Rights owner", track.rightsOwner],
                  ["Publisher", track.publisher],
                  ["Label", track.label],
                  ["Notes", track.notes],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[0.8125rem] text-t2">{label}</dt>
                  <dd className="mt-0.5 text-tx">{value ?? "Not set"}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}

      {track.inCatalogue && canManage && (
        <section className="border-t border-line pt-6">
          <details>
            <summary className="cursor-pointer text-[0.8125rem] font-medium text-mismatch">Take this song out of the catalogue</summary>
            <form action={removeSongAction} className="mt-3 max-w-xl space-y-3 rounded-2xl bg-mismatch-bg p-4">
              <input type="hidden" name="trackId" value={track.id} />
              <p className="text-sm text-mismatch">
                Scans stop checking posts for it. Its rights records, the verdicts so far and their cases stay, and
                adding the song again brings them back.
              </p>
              <button type="submit" className="rounded-full bg-mismatch px-4 py-1.5 text-[0.8125rem] font-medium text-white">
                Take out of catalogue
              </button>
            </form>
          </details>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <dt className="text-[0.8125rem] text-t2">{label}</dt>
      <dd className={`mt-1 text-[1.75rem] leading-none font-semibold tracking-[-0.02em] tabular-nums ${tone ?? "text-tx"}`}>{value}</dd>
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
