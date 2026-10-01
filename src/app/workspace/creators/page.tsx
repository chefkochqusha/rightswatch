import Link from "next/link";
import { requireSession } from "@/app/_lib/current-user";
import { canManageCases } from "@/app/_lib/authorize";
import { getCreatorStore } from "@/app/_lib/creator-store";
import { getCreatorAllowance } from "@/app/_lib/creator-allowance";
import { getConnectorMode } from "@/app/_lib/connector-mode";
import { getWorkspaceScanItems } from "@/app/_lib/workspace-scan-store";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonStyles } from "@/components/ui/button";
import { SearchIcon } from "@/components/ui/icons";
import { CreatorStatusBadge } from "@/components/creators/creator-status-badge";
import { countryOptions } from "@/components/creators/country-options";
import { CREATOR_STATUS_LABELS, countryName, formatFollowers } from "@/components/creators/labels";
import { formatRelativeTime } from "@/components/ui/time";
import type { CreatorRecord, CreatorStatus } from "@/modules/creators";
import { AddCreatorForm } from "./add-creator-form";
import { MonitoringToggle } from "./monitoring-toggle";
import { addDemoCreatorsAction } from "./actions";

export const metadata = {
  title: "Creators — RightsWatch",
};

const STATUS_FILTERS: CreatorStatus[] = ["ACTIVE", "PENDING", "PAUSED", "ERROR"];

/**
 * The watchlist (Brief §8): who RightsWatch monitors for commercial posts,
 * with add, pause, resume, search and filter. The plan's limit (§19) is
 * shown where it applies — next to adding.
 */
export default async function CreatorsPage({ searchParams }: PageProps<"/workspace/creators">) {
  const session = await requireSession();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const statusFilter = STATUS_FILTERS.find((status) => status === params.status) ?? null;

  const canManage = canManageCases(session.role);
  const [creators, allowance, items] = await Promise.all([
    getCreatorStore().creators.findForWorkspace(session.workspace.id),
    getCreatorAllowance(session.workspace.id),
    getWorkspaceScanItems(session.workspace.id),
  ]);

  const monitored = creators.filter((creator) => creator.monitoringEnabled).length;
  const statsByCreator = new Map<string, { matches: number; flagged: number }>();
  for (const item of items) {
    const stats = statsByCreator.get(item.creatorId) ?? { matches: 0, flagged: 0 };
    if (item.kind === "ASSESSED") {
      stats.matches += 1;
      if (item.assessment.status !== "CLEARED") stats.flagged += 1;
    }
    statsByCreator.set(item.creatorId, stats);
  }

  const visible = creators.filter((creator) => matchesQuery(creator, query) && (!statusFilter || creator.status === statusFilter));
  const countByStatus = new Map<CreatorStatus, number>();
  for (const creator of creators) countByStatus.set(creator.status, (countByStatus.get(creator.status) ?? 0) + 1);
  const now = new Date();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Creators"
        description="The TikTok creators RightsWatch checks for commercial posts. Each scan looks at what they've published since the last one."
      />

      <section className="rounded-[1.125rem] border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="text-[1.0625rem] font-semibold tracking-[-0.01em]">Add a creator</h2>
          <PlanUsage monitored={monitored} cap={allowance.cap} planName={allowance.planName} />
        </div>
        {allowance.cap > 0 && <UsageBar monitored={monitored} cap={allowance.cap} />}
        <div className="mt-5">
          {!canManage ? (
            <p className="text-sm text-t2">Ask an owner, admin or analyst to add creators.</p>
          ) : allowance.cap <= 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
              <p className="text-sm text-tx">
                Choose a plan to start monitoring creators. Every plan starts with a free 14-day trial, no card needed.
              </p>
              <Link href="/workspace/billing" className={buttonStyles("primary", "sm")}>
                Choose a plan
              </Link>
            </div>
          ) : (
            <>
              <AddCreatorForm countries={countryOptions()} />
              {getConnectorMode() === "DEMO" && (
                <form action={addDemoCreatorsAction} className="mt-5 border-t border-line pt-4">
                  <p className="text-[0.8125rem] text-t2">
                    Trying it out? Add the six demo creators — fictional accounts with posts that reach every
                    verdict the rights check can give.{" "}
                    <button type="submit" className="font-medium text-accent hover:underline">
                      Add demo creators
                    </button>
                  </p>
                </form>
              )}
            </>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.125rem] border border-line bg-surface">
        {creators.length === 0 ? (
          <EmptyState
            title="No creators are being monitored yet."
            description="Add the TikTok creators who might use your music in paid posts. RightsWatch checks their commercial content on every scan."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <nav aria-label="Filter by status" className="-mx-1 flex flex-wrap gap-1">
                <FilterLink href={filterHref(query, null)} active={!statusFilter} label="All" count={creators.length} />
                {STATUS_FILTERS.map((status) => (
                  <FilterLink
                    key={status}
                    href={filterHref(query, status)}
                    active={statusFilter === status}
                    label={CREATOR_STATUS_LABELS[status]}
                    count={countByStatus.get(status) ?? 0}
                  />
                ))}
              </nav>
              <form role="search" className="relative w-full sm:w-64">
                {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-t2" />
                <label htmlFor="creator-search" className="sr-only">
                  Search creators
                </label>
                <input
                  id="creator-search"
                  name="q"
                  type="search"
                  defaultValue={query}
                  placeholder="Search by name or username"
                  className="block h-8 w-full rounded-full border border-line bg-bg pr-3 pl-8 text-[0.8125rem] text-tx placeholder:text-t2"
                />
              </form>
            </div>

            {visible.length === 0 ? (
              <EmptyState
                title="No creators match."
                description={query ? `Nobody on your watchlist matches “${query}”.` : "No creator has this status right now."}
              >
                <Link href="/workspace/creators" className={buttonStyles("secondary", "sm")}>
                  Show all creators
                </Link>
              </EmptyState>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[46rem] text-left text-sm">
                  <thead>
                    <tr className="text-xs text-t2">
                      <th scope="col" className="px-5 py-2.5 font-medium">Creator</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Country</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Followers</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Last scan</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Matches</th>
                      {canManage && (
                        <th scope="col" className="px-5 py-2.5">
                          <span className="sr-only">Monitoring</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((creator) => {
                      const stats = statsByCreator.get(creator.id);
                      return (
                        <tr key={creator.id} className="border-t border-line transition-colors hover:bg-hover">
                          <td className="px-5 py-3">
                            <Link href={`/workspace/creators/${creator.id}`} className="group block">
                              <span className="font-medium text-tx group-hover:text-accent">@{creator.handle}</span>
                              {creator.displayName && (
                                <span className="block text-[0.8125rem] text-t2">{creator.displayName}</span>
                              )}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-t2">{countryName(creator.country)}</td>
                          <td className="px-4 py-3 text-right text-t2 tabular-nums">{formatFollowers(creator.followerCount)}</td>
                          <td className="px-4 py-3">
                            <CreatorStatusBadge status={creator.status} />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-t2">
                            {creator.lastSeenAt ? formatRelativeTime(creator.lastSeenAt, now) : "Not yet"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <span className="text-tx">{stats?.matches ?? 0}</span>
                            {stats && stats.flagged > 0 && (
                              <span className="block text-xs text-mismatch">{stats.flagged} to review</span>
                            )}
                          </td>
                          {canManage && (
                            <td className="px-5 py-3 text-right">
                              <MonitoringToggle creatorId={creator.id} monitoring={creator.monitoringEnabled} />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function matchesQuery(creator: CreatorRecord, query: string): boolean {
  if (!query) return true;
  const needle = query.replace(/^@/, "").toLowerCase();
  return creator.handle.includes(needle) || (creator.displayName?.toLowerCase().includes(needle) ?? false);
}

function filterHref(query: string, status: CreatorStatus | null): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status) params.set("status", status);
  const search = params.toString();
  return search ? `/workspace/creators?${search}` : "/workspace/creators";
}

function FilterLink({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3 py-1 text-[0.8125rem] font-medium transition-colors ${
        active ? "bg-tx text-bg" : "text-t2 hover:bg-hover hover:text-tx"
      }`}
    >
      {label} <span className={active ? "opacity-70" : "text-t2"}>{count}</span>
    </Link>
  );
}

function PlanUsage({ monitored, cap, planName }: { monitored: number; cap: number; planName: string | null }) {
  if (cap <= 0) return <p className="text-[0.8125rem] text-t2">No plan yet</p>;
  return (
    <p className="text-[0.8125rem] text-t2">
      <span className="font-medium text-tx tabular-nums">
        {monitored} of {cap}
      </span>{" "}
      creators monitored on {planName ?? "your plan"}
    </p>
  );
}

function UsageBar({ monitored, cap }: { monitored: number; cap: number }) {
  const share = Math.min(1, monitored / cap);
  return (
    <div
      role="meter"
      aria-label="Creators monitored"
      aria-valuemin={0}
      aria-valuemax={cap}
      aria-valuenow={monitored}
      className="mt-3 h-1 overflow-hidden rounded-full bg-hover"
    >
      <div
        className={`h-full rounded-full ${share >= 1 ? "bg-mismatch" : share >= 0.9 ? "bg-unknown" : "bg-accent"}`}
        style={{ width: `${Math.max(share * 100, monitored > 0 ? 2 : 0)}%` }}
      />
    </div>
  );
}
