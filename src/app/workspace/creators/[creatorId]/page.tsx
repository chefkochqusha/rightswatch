import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession, requireSession } from "@/app/_lib/current-user";
import { canManageCases } from "@/app/_lib/authorize";
import { getCreatorStore } from "@/app/_lib/creator-store";
import { getCaseStore } from "@/app/_lib/case-store";
import { getJobStore } from "@/app/_lib/job-store";
import { getScanResultStore } from "@/app/_lib/scan-result-store";
import { getLibraryStore } from "@/app/_lib/library-store";
import { httpsUrl } from "@/modules/connectors";
import { SCAN_JOB_TYPE, creatorScanHistory, type ScanJobPayload } from "@/modules/jobs";
import { buttonStyles } from "@/components/ui/button";
import { ExternalIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { CaseStatusBadge } from "@/components/cases/case-status-badge";
import { CreatorStatusBadge } from "@/components/creators/creator-status-badge";
import { countryOptions } from "@/components/creators/country-options";
import { CREATOR_STATUS_DESCRIPTIONS, countryName, formatFollowers } from "@/components/creators/labels";
import { formatRelativeTime } from "@/components/ui/time";
import { MonitoringToggle } from "../monitoring-toggle";
import { removeCreatorAction } from "../actions";
import { EditDetailsForm } from "./edit-details-form";
import { RestoreForm } from "./restore-form";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export async function generateMetadata({ params }: PageProps<"/workspace/creators/[creatorId]">): Promise<Metadata> {
  const { creatorId } = await params;
  const session = await getCurrentSession();
  if (!session) return {};
  const creator = await getCreatorStore().creators.findById(session.workspace.id, creatorId);
  return { title: creator ? `@${creator.handle} — RightsWatch` : "Page not found — RightsWatch" };
}

/**
 * One creator (Brief §8's creator detail page): who they are, how
 * monitoring is going, and what RightsWatch found — music matches, recent
 * videos, cases, campaigns and monitoring history. A removed creator's
 * page stays reachable (from the audit log, from its cases) and says so.
 */
export default async function CreatorPage({ params }: PageProps<"/workspace/creators/[creatorId]">) {
  const { creatorId } = await params;
  const session = await requireSession();
  const workspaceId = session.workspace.id;

  const creator = await getCreatorStore().creators.findById(workspaceId, creatorId);
  if (!creator) notFound();

  const [items, cases, jobs, campaigns] = await Promise.all([
    getScanResultStore().results.findForCreator(workspaceId, creator.id),
    getCaseStore().cases.findForWorkspace(workspaceId),
    getJobStore().jobs.findRecent<ScanJobPayload>(workspaceId, SCAN_JOB_TYPE, 20),
    getLibraryStore().campaigns.findForCreatorId(workspaceId, creator.id),
  ]);

  const matches = items.filter((item) => item.kind === "ASSESSED");
  const caseByAssessment = new Map(cases.map((c) => [c.rightsAssessmentId, c]));
  const creatorCases = matches.flatMap((item) => {
    const found = caseByAssessment.get(item.rightsAssessmentId);
    return found ? [{ item, case: found }] : [];
  });
  const history = creatorScanHistory(jobs, creator.id).filter((entry) => entry.result);
  const canManage = canManageCases(session.role);
  const now = new Date();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/workspace/creators" className="text-[0.8125rem] text-t2 hover:text-tx">
          ← Creators
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[2rem] leading-[1.1] font-semibold tracking-[-0.02em]">@{creator.handle}</h1>
              {!creator.removedAt && <CreatorStatusBadge status={creator.status} />}
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.9375rem] text-t2">
              {creator.displayName && <span className="text-tx">{creator.displayName}</span>}
              {httpsUrl(creator.profileUrl) && (
                <a
                  href={httpsUrl(creator.profileUrl)!}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  Profile on TikTok
                  <ExternalIcon className="h-3 w-3" />
                </a>
              )}
            </p>
          </div>
          {canManage && !creator.removedAt && (
            <div className="flex items-start gap-2">
              <MonitoringToggle creatorId={creator.id} monitoring={creator.monitoringEnabled} />
              <details className="group relative">
                <summary className={`${buttonStyles("danger", "sm")} cursor-pointer list-none`}>Remove</summary>
                <div className="absolute right-0 z-10 mt-2 w-72 rounded-2xl border border-line bg-surface p-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
                  <p className="text-[0.8125rem] text-tx">
                    Stop monitoring @{creator.handle}? Their posts and cases stay. You can add them back any time.
                  </p>
                  <form action={removeCreatorAction} className="mt-3">
                    <input type="hidden" name="creatorId" value={creator.id} />
                    <button type="submit" className={buttonStyles("primary", "sm")}>
                      Remove from watchlist
                    </button>
                  </form>
                </div>
              </details>
            </div>
          )}
        </div>
      </div>

      {creator.removedAt ? (
        <Callout tone="neutral">
          <p>
            Removed from the watchlist on {dateFormatter.format(creator.removedAt)}. Nothing new is fetched; what was
            found before stays below.
          </p>
          {canManage && (
            <div className="mt-3">
              <RestoreForm handle={creator.handle} />
            </div>
          )}
        </Callout>
      ) : (
        creator.status === "ERROR" && (
          <Callout tone="error">
            <p className="font-medium">The latest scan couldn&apos;t fetch this creator&apos;s posts.</p>
            <p className="mt-1">
              {creator.lastError ?? "The connector didn't say why."} Earlier results are still here, and the next
              scan tries again.
            </p>
          </Callout>
        )
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-[1.125rem] border border-line bg-surface p-5 sm:grid-cols-4 sm:p-6">
        <Fact label="Country" value={countryName(creator.country)} />
        <Fact label="Followers" value={formatFollowers(creator.followerCount)} />
        <Fact
          label="Last scan"
          value={creator.lastSeenAt ? formatRelativeTime(creator.lastSeenAt, now) : "Not scanned yet"}
          title={creator.lastSeenAt ? dateTimeFormatter.format(creator.lastSeenAt) : undefined}
        />
        <Fact label="On the watchlist since" value={dateFormatter.format(creator.createdAt)} />
        {!creator.removedAt && (
          <p className="col-span-full text-[0.8125rem] text-t2">{CREATOR_STATUS_DESCRIPTIONS[creator.status]}</p>
        )}
      </dl>

      <Section title="Music matches" count={matches.length}>
        {matches.length === 0 ? (
          <Empty>No music matches detected.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {matches.map((item) => (
              <li key={item.content.externalContentId}>
                <Link
                  href={`/workspace/items/${encodeURIComponent(item.content.externalContentId)}`}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3.5 transition-colors hover:bg-hover"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-tx">{item.musicMatch.title}</span>
                    <span className="block text-[0.8125rem] text-t2">
                      {item.musicMatch.artist}, in a post for {item.content.brandNames.join(" and ") || "an unnamed brand"}
                    </span>
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="text-[0.8125rem] whitespace-nowrap text-t2">
                      {dateFormatter.format(item.content.publishedAt)}
                    </span>
                    <StatusBadge status={item.assessment.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recent videos" count={items.length}>
        {items.length === 0 ? (
          <Empty>No commercial posts found yet.</Empty>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="text-xs text-t2">
                  <th scope="col" className="px-5 py-2.5 font-medium">Published</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Brand</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Music</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 25).map((item) => (
                  <tr key={item.content.externalContentId} className="border-t border-line">
                    <td className="px-5 py-3 whitespace-nowrap text-t2">{dateFormatter.format(item.content.publishedAt)}</td>
                    <td className="px-4 py-3 text-tx">
                      {item.content.brandNames.join(", ") || "—"}
                      {item.content.label && <span className="block text-xs text-t2">{item.content.label}</span>}
                    </td>
                    <td className="px-4 py-3 text-t2">
                      {item.kind === "ASSESSED"
                        ? `${item.musicMatch.title}, ${item.musicMatch.artist}`
                        : item.kind === "OTHER_MUSIC"
                          ? `${item.musicMatch.title}, ${item.musicMatch.artist} (not in your catalogue)`
                          : item.kind === "NO_MUSIC_MATCH"
                            ? "No track identified"
                            : "Identification didn't complete"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/workspace/items/${encodeURIComponent(item.content.externalContentId)}`}
                        className="text-[0.8125rem] font-medium text-accent hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Cases" count={creatorCases.length}>
          {creatorCases.length === 0 ? (
            <Empty>Nothing needs review right now.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {creatorCases.map(({ item, case: c }) => (
                <li key={c.id}>
                  <Link
                    href={`/workspace/items/${encodeURIComponent(item.content.externalContentId)}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-hover"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-tx">{item.musicMatch.title}</span>
                      <span className="block text-[0.8125rem] text-t2">Opened {dateFormatter.format(c.createdAt)}</span>
                    </span>
                    <CaseStatusBadge status={c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Campaigns" count={campaigns.length}>
          {campaigns.length === 0 ? (
            <Empty>Not on any campaign.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {campaigns.map((campaign) => (
                <li key={campaign.id} className="px-5 py-3.5 text-sm font-medium text-tx">
                  {campaign.name}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Monitoring history" count={history.length}>
        {history.length === 0 ? (
          <Empty>No scan has reached this creator yet.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {history.map((entry) => (
              <li key={entry.jobId} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-3 text-sm">
                <span className="text-tx">{dateTimeFormatter.format(entry.at)}</span>
                <span className={entry.result?.error ? "text-mismatch" : "text-t2"}>
                  {entry.result?.error
                    ? `Couldn't fetch posts: ${entry.result.error}`
                    : `${plural(entry.result?.videos ?? 0, "commercial post")} checked, ${plural(entry.result?.matches ?? 0, "music match", "music matches")}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {canManage && !creator.removedAt && (
        <section className="rounded-[1.125rem] border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-[1.0625rem] font-semibold tracking-[-0.01em]">Details</h2>
          <p className="mt-1 mb-5 text-[0.8125rem] text-t2">
            TikTok doesn&apos;t report where a post was shown, so the creator&apos;s country stands in for it when a
            rights record covers specific territories.
          </p>
          <EditDetailsForm
            countries={countryOptions()}
            creatorId={creator.id}
            displayName={creator.displayName}
            country={creator.country}
            followerCount={creator.followerCount}
          />
        </section>
      )}
    </div>
  );
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function Fact({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div>
      <dt className="text-[0.8125rem] text-t2">{label}</dt>
      <dd className="mt-1 text-[1.0625rem] font-semibold tracking-[-0.01em] text-tx" title={title}>
        {value}
      </dd>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[1.125rem] border border-line bg-surface">
      <h2 className="flex items-baseline gap-2 px-5 pt-4 pb-3 text-[1.0625rem] font-semibold tracking-[-0.01em]">
        {title}
        <span className="text-[0.8125rem] font-normal text-t2 tabular-nums">{count}</span>
      </h2>
      <div className="border-t border-line">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-6 text-sm text-t2">{children}</p>;
}

function Callout({ tone, children }: { tone: "neutral" | "error"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={`rounded-2xl px-5 py-4 text-sm ${tone === "error" ? "bg-mismatch-bg text-tx" : "bg-surface-2 text-tx"}`}
    >
      {children}
    </div>
  );
}
