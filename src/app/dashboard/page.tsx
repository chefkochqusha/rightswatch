import Link from "next/link";
import { getDemoScanResults } from "@/app/_lib/get-demo-scan-results";
import { AppHeader } from "@/components/layout/app-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { REASON_LABELS, STATUS_SORT_ORDER } from "@/components/rights/labels";
import type { RightsAssessmentStatus } from "@/modules/rights-engine/types";
import type { ScanItemResult } from "@/modules/scan-pipeline";

export const metadata = {
  title: "Dashboard — RightsWatch",
};

interface Row {
  key: string;
  creatorUsername: string;
  brandNames: string[];
  publishedAt: Date;
  item: ScanItemResult;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

export default async function DashboardPage() {
  const scans = await getDemoScanResults();

  const rows: Row[] = scans.flatMap((scan) =>
    scan.items.map((item) => ({
      key: item.content.externalContentId,
      creatorUsername: scan.creatorUsername,
      brandNames: item.content.brandNames,
      publishedAt: item.content.publishedAt,
      item,
    })),
  );

  rows.sort((a, b) => {
    const aRank = a.item.kind === "ASSESSED" ? STATUS_SORT_ORDER[a.item.assessment.status] : -1;
    const bRank = b.item.kind === "ASSESSED" ? STATUS_SORT_ORDER[b.item.assessment.status] : -1;
    if (aRank !== bRank) return aRank - bRank;
    return b.publishedAt.getTime() - a.publishedAt.getTime();
  });

  const counts: Record<RightsAssessmentStatus, number> = {
    CLEARED: 0,
    REVIEW: 0,
    POTENTIAL_MISMATCH: 0,
    UNKNOWN: 0,
  };
  for (const row of rows) {
    if (row.item.kind === "ASSESSED") counts[row.item.assessment.status] += 1;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="dashboard" />

      <main className="mx-auto w-full max-w-(--content-width) flex-1 px-6 py-8 [--content-width:1100px]">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-t2">
            Example data — no TikTok connection is required to see how
            RightsWatch assesses commercial content. Connect a workspace to
            scan real creators.
          </p>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Potential mismatches" count={counts.POTENTIAL_MISMATCH} tone="mismatch" />
          <StatCard label="Needs review" count={counts.REVIEW} tone="review" />
          <StatCard label="Unknown" count={counts.UNKNOWN} tone="unknown" />
          <StatCard label="Cleared" count={counts.CLEARED} tone="cleared" />
        </div>

        <section className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-sm font-semibold">Rights assessments</h2>
            <p className="mt-0.5 text-[0.8125rem] text-t2">
              Every piece of commercial content scanned across your
              monitored creators, most urgent first.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[0.8125rem] text-t2">
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Creator</th>
                  <th className="px-5 py-3 font-medium">Brand</th>
                  <th className="px-5 py-3 font-medium">Track</th>
                  <th className="px-5 py-3 font-medium">Published</th>
                  <th className="px-5 py-3 font-medium">Detail</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-b border-line last:border-0">
                    <td className="px-5 py-3.5 align-top">
                      {row.item.kind === "ASSESSED" ? (
                        <StatusBadge status={row.item.assessment.status} />
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-hover px-2.5 py-1 text-xs font-medium text-t2 whitespace-nowrap">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                          {row.item.kind === "NO_MUSIC_MATCH"
                            ? "No track identified"
                            : "Identification failed"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 align-top whitespace-nowrap text-tx">
                      @{row.creatorUsername}
                    </td>
                    <td className="px-5 py-3.5 align-top text-t2">
                      {row.brandNames.join(", ") || "—"}
                    </td>
                    <td className="px-5 py-3.5 align-top">
                      {row.item.kind === "ASSESSED" ? (
                        <div>
                          <div className="text-tx">{row.item.musicMatch.title}</div>
                          <div className="text-[0.8125rem] text-t2">
                            {row.item.musicMatch.artist}
                          </div>
                        </div>
                      ) : (
                        <span className="text-t2">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 align-top whitespace-nowrap text-t2">
                      {dateFormatter.format(row.publishedAt)}
                    </td>
                    <td className="px-5 py-3.5 align-top text-t2">
                      {row.item.kind === "ASSESSED" && row.item.assessment.reason
                        ? REASON_LABELS[row.item.assessment.reason]
                        : row.item.kind === "MUSIC_ID_ERROR"
                          ? row.item.error
                          : "—"}
                    </td>
                    <td className="px-5 py-3.5 align-top whitespace-nowrap">
                      <Link
                        href={`/assessments/${encodeURIComponent(row.key)}`}
                        className="text-[0.8125rem] font-medium text-accent hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatCard({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "cleared" | "review" | "unknown" | "mismatch";
}) {
  const toneClass = {
    cleared: "text-cleared",
    review: "text-review",
    unknown: "text-unknown",
    mismatch: "text-mismatch",
  }[tone];

  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3.5">
      <div className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{count}</div>
      <div className="mt-0.5 text-[0.8125rem] text-t2">{label}</div>
    </div>
  );
}
