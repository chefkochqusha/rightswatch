import Link from "next/link";
import { requireSession } from "@/app/_lib/current-user";
import { getCaseStore } from "@/app/_lib/case-store";
import { getLibraryStore } from "@/app/_lib/library-store";
import { getWorkspaceScanItems } from "@/app/_lib/workspace-scan-store";
import { getWorkspaceMembers } from "@/app/_lib/members";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { CoverArt } from "@/components/music/cover-art";
import { CaseStatusBadge } from "@/components/cases/case-status-badge";
import { CasePriorityBadge } from "@/components/cases/case-priority-badge";
import { REASON_LABELS } from "@/components/rights/labels";
import { formatRelativeTime } from "@/components/ui/time";
import { buttonStyles } from "@/components/ui/button";
import { sortCasesByUrgency, statusInGroup, type CaseGroup } from "@/modules/cases";

export const metadata = { title: "Cases — RightsWatch" };

const PAGE_SIZE = 25;
const GROUPS: { key: CaseGroup; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

function href(params: { group: CaseGroup; mine: boolean; q: string; limit?: number }): string {
  const search = new URLSearchParams();
  if (params.group !== "active") search.set("group", params.group);
  if (params.mine) search.set("mine", "1");
  if (params.q) search.set("q", params.q);
  if (params.limit && params.limit > PAGE_SIZE) search.set("limit", String(params.limit));
  const query = search.toString();
  return query ? `/workspace/cases?${query}` : "/workspace/cases";
}

/**
 * Every case in the workspace (Brief §12), most urgent first: priority,
 * then whichever has waited longest. Filter by what still needs someone,
 * by "mine", or by a word from the creator, song or brand.
 */
export default async function CasesPage({ searchParams }: PageProps<"/workspace/cases">) {
  const query = await searchParams;
  const session = await requireSession();
  const workspaceId = session.workspace.id;

  const group: CaseGroup = GROUPS.find((g) => g.key === query.group)?.key ?? "active";
  const mine = query.mine === "1";
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 80) : "";
  const requested = Number(typeof query.limit === "string" ? query.limit : PAGE_SIZE);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.floor(requested), PAGE_SIZE), 500) : PAGE_SIZE;

  const [cases, items, tracks, members] = await Promise.all([
    getCaseStore().cases.findForWorkspace(workspaceId),
    getWorkspaceScanItems(workspaceId),
    getLibraryStore().catalog.findAllKnown(workspaceId),
    getWorkspaceMembers(workspaceId),
  ]);
  const itemByAssessment = new Map(items.flatMap((item) => (item.rightsAssessmentId ? [[item.rightsAssessmentId, item] as const] : [])));
  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const nameOf = new Map(members.map((member) => [member.userId, member.name]));

  const counts = Object.fromEntries(GROUPS.map((g) => [g.key, cases.filter((c) => statusInGroup(c.status, g.key)).length])) as Record<CaseGroup, number>;
  const needle = q.toLowerCase();

  const rows = sortCasesByUrgency(cases)
    .filter((c) => statusInGroup(c.status, group))
    .filter((c) => !mine || c.assignedToId === session.user.id)
    .map((c) => ({ case: c, item: itemByAssessment.get(c.rightsAssessmentId) }))
    .filter(({ item }) => item?.kind === "ASSESSED")
    .filter(({ item }) => {
      if (!needle || !item || item.kind !== "ASSESSED") return true;
      const haystack = [item.creatorUsername, item.musicMatch.title, item.musicMatch.artist, ...item.content.brandNames].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  const visible = rows.slice(0, limit);
  const now = new Date();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Cases"
        description="Every post the rights check didn't clear becomes a case. Work them from the top: the most urgent come first."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Case groups" className="flex gap-1 rounded-full bg-hover p-1">
          {GROUPS.map((g) => (
            <Link
              key={g.key}
              href={href({ group: g.key, mine, q })}
              aria-current={group === g.key ? "true" : undefined}
              className={`rounded-full px-3 py-1 text-[0.8125rem] font-medium transition-colors ${group === g.key ? "bg-surface text-tx shadow-sm" : "text-t2 hover:text-tx"}`}
            >
              {g.label} <span className="tabular-nums text-t2">{counts[g.key]}</span>
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={href({ group, mine: !mine, q })}
            aria-current={mine ? "true" : undefined}
            className={mine ? buttonStyles("primary", "sm") : buttonStyles("secondary", "sm")}
          >
            Assigned to me
          </Link>
          <form action="/workspace/cases" className="relative">
            {group !== "active" && <input type="hidden" name="group" value={group} />}
            {mine && <input type="hidden" name="mine" value="1" />}
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-t2" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Creator, song or brand"
              aria-label="Search cases"
              className="h-8 w-52 rounded-full border border-line bg-surface pr-3 pl-8 text-[0.8125rem] text-tx placeholder:text-t2 focus:ring-2 focus:ring-accent focus:outline-none"
            />
          </form>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-[1.125rem] border border-line bg-surface">
          <EmptyState
            title={cases.length === 0 ? "No cases yet." : "No cases match."}
            description={
              cases.length === 0
                ? "When a scan finds a post the rights check can't clear, RightsWatch opens a case for it here."
                : "Try another group, or clear the search."
            }
          >
            {cases.length > 0 && (
              <Link href="/workspace/cases" className={buttonStyles("secondary", "sm")}>
                Show active cases
              </Link>
            )}
          </EmptyState>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-[1.125rem] border border-line bg-surface">
            {visible.map(({ case: c, item }) => {
              if (!item || item.kind !== "ASSESSED") return null;
              const track = trackById.get(item.musicMatch.trackId);
              return (
                <li key={c.id} className="relative flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3.5 transition-colors hover:bg-hover sm:px-5">
                  <div className="w-24 shrink-0">
                    <CasePriorityBadge priority={c.priority} />
                  </div>
                  <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
                    <CoverArt title={item.musicMatch.title} artist={item.musicMatch.artist || null} artworkUrl={track?.artworkUrl} className="h-11 w-11 shrink-0 rounded-lg" />
                    <div className="min-w-0">
                      <p className="truncate text-[0.9375rem] font-medium">
                        <Link href={`/workspace/items/${encodeURIComponent(item.content.externalContentId)}`} className="after:absolute after:inset-0 focus-visible:outline-none">
                          {item.musicMatch.title}
                        </Link>
                        <span className="font-normal text-t2"> by {item.musicMatch.artist}</span>
                      </p>
                      <p className="truncate text-[0.8125rem] text-t2">
                        @{item.creatorUsername}
                        {item.content.brandNames.length > 0 && ` for ${item.content.brandNames.join(", ")}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex min-w-0 basis-56 flex-col items-start gap-1">
                    <StatusBadge status={item.assessment.status} />
                    {item.assessment.reason && <span className="text-[0.8125rem] text-t2">{REASON_LABELS[item.assessment.reason]}</span>}
                  </div>
                  <div className="flex items-center gap-4 sm:ml-auto">
                    <span className="hidden w-28 truncate text-[0.8125rem] text-t2 lg:block">{c.assignedToId ? (nameOf.get(c.assignedToId) ?? "A former member") : "Unassigned"}</span>
                    <CaseStatusBadge status={c.status} />
                    <span className="w-20 text-right text-[0.8125rem] text-t2">{formatRelativeTime(c.updatedAt, now)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between gap-3 text-[0.8125rem] text-t2">
            <p>Showing {visible.length} of {rows.length}</p>
            {visible.length < rows.length && (
              <Link href={href({ group, mine, q, limit: limit + PAGE_SIZE })} scroll={false} className={buttonStyles("secondary", "sm")}>
                Show more
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
