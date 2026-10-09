import Link from "next/link";
import { requireSession } from "@/app/_lib/current-user";
import { loadReportData, parsePeriod, REPORT_PERIODS } from "@/app/_lib/report-data";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonStyles } from "@/components/ui/button";
import { STATUS_LABELS } from "@/components/rights/labels";
import { CASE_STATUS_LABELS } from "@/components/cases/labels";
import { summarize } from "@/modules/reports";
import type { CaseStatus } from "@/modules/cases";

export const metadata = { title: "Reports — Bekvor" };

const VERDICT_ORDER = ["POTENTIAL_MISMATCH", "REVIEW", "UNKNOWN", "CLEARED"] as const;
const VERDICT_BAR: Record<(typeof VERDICT_ORDER)[number], string> = {
  POTENTIAL_MISMATCH: "bg-mismatch",
  REVIEW: "bg-review",
  UNKNOWN: "bg-unknown",
  CLEARED: "bg-cleared",
};
const VERDICT_TEXT: Record<(typeof VERDICT_ORDER)[number], string> = {
  POTENTIAL_MISMATCH: "text-mismatch",
  REVIEW: "text-review",
  UNKNOWN: "text-unknown",
  CLEARED: "text-cleared",
};

/**
 * Reports (Brief §25): what the scans found over a period, how the rights
 * checks came out, which songs and creators account for the posts to
 * review, and where the cases stand — plus the same posts as a CSV.
 */
export default async function ReportsPage({ searchParams }: PageProps<"/workspace/reports">) {
  const query = await searchParams;
  const session = await requireSession();
  const period = parsePeriod(query.period);
  const data = await loadReportData(session.workspace, period);
  const summary = summarize(data.items);

  const assessed = VERDICT_ORDER.reduce((sum, key) => sum + summary.verdicts[key], 0);
  const toReview = assessed - summary.verdicts.CLEARED;
  const caseIds = new Set(data.items.flatMap((item) => (item.rightsAssessmentId ? [item.rightsAssessmentId] : [])));
  const periodCases = data.cases.filter((c) => caseIds.has(c.rightsAssessmentId));
  const caseCounts = new Map<CaseStatus, number>();
  for (const c of periodCases) caseCounts.set(c.status, (caseCounts.get(c.status) ?? 0) + 1);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Reports"
        description="What the scans found, how the rights checks came out, and where the cases stand."
        actions={
          summary.withMusic > 0 ? (
            <a href={`/workspace/reports/export?period=${period}`} download className={buttonStyles("primary")}>
              Download CSV
            </a>
          ) : undefined
        }
      />

      <nav aria-label="Period" className="flex w-fit gap-1 rounded-full bg-hover p-1">
        {REPORT_PERIODS.map((p) => (
          <Link
            key={p.key}
            href={p.key === "90d" ? "/workspace/reports" : `/workspace/reports?period=${p.key}`}
            aria-current={period === p.key ? "true" : undefined}
            className={`rounded-full px-3 py-1 text-[0.8125rem] font-medium transition-colors ${period === p.key ? "bg-surface text-tx shadow-sm" : "text-t2 hover:text-tx"}`}
          >
            {p.label}
          </Link>
        ))}
      </nav>

      {summary.withMusic === 0 ? (
        <div className="rounded-[1.125rem] border border-line bg-surface">
          <EmptyState
            title="Nothing to report in this period."
            description="Reports count the posts a scan found with a song in them, by the date each post was published. Run a scan, or pick a longer period."
          />
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-4">
            <Figure label="Posts checked" value={summary.postsChecked} />
            <Figure label="With a song in them" value={summary.withMusic} />
            <Figure label="To review" value={toReview} tone={toReview > 0 ? "text-mismatch" : undefined} />
            <Figure label="Cases" value={periodCases.length} />
          </dl>

          <section aria-labelledby="verdicts-heading">
            <h2 id="verdicts-heading" className="text-[1.0625rem] font-semibold tracking-[-0.01em]">How the rights checks came out</h2>
            {assessed === 0 ? (
              <p className="mt-3 text-sm text-t2">None of these songs is in your catalogue yet, so nothing was checked.</p>
            ) : (
              <>
                <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-hover" role="img" aria-label={VERDICT_ORDER.map((k) => `${STATUS_LABELS[k]} ${summary.verdicts[k]}`).join(", ")}>
                  {VERDICT_ORDER.map((key) =>
                    summary.verdicts[key] > 0 ? <span key={key} className={VERDICT_BAR[key]} style={{ width: `${(summary.verdicts[key] / assessed) * 100}%` }} /> : null,
                  )}
                </div>
                <ul className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
                  {VERDICT_ORDER.map((key) => (
                    <li key={key} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-sm">
                      <span className={`font-medium ${VERDICT_TEXT[key]}`}>{STATUS_LABELS[key]}</span>
                      <span className="tabular-nums">{summary.verdicts[key]}</span>
                    </li>
                  ))}
                </ul>
                {summary.notInCatalogue > 0 && (
                  <p className="mt-3 text-[0.8125rem] text-t2">
                    {summary.notInCatalogue} more {summary.notInCatalogue === 1 ? "post uses a song" : "posts use songs"} that aren&apos;t in your catalogue, so they weren&apos;t checked.
                  </p>
                )}
              </>
            )}
          </section>

          <div className="grid gap-10 lg:grid-cols-2">
            <RankTable
              title="Songs"
              rows={summary.bySong.slice(0, 8).map((s) => ({ key: s.trackId, name: s.title, sub: s.artist, posts: s.posts, toReview: s.toReview, href: `/workspace/rights/${s.trackId}` }))}
            />
            <RankTable
              title="Creators"
              rows={summary.byCreator.slice(0, 8).map((c) => ({ key: c.username, name: `@${c.username}`, sub: null, posts: c.posts, toReview: c.toReview, href: null }))}
            />
          </div>

          {periodCases.length > 0 && (
            <section aria-labelledby="cases-heading">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="cases-heading" className="text-[1.0625rem] font-semibold tracking-[-0.01em]">Cases from these posts</h2>
                <Link href="/workspace/cases?group=all" className="text-[0.8125rem] font-medium text-accent hover:underline">All cases</Link>
              </div>
              <ul className="mt-3 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
                {(Object.keys(CASE_STATUS_LABELS) as CaseStatus[]).map((status) => (
                  <li key={status} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-sm">
                    <span>{CASE_STATUS_LABELS[status]}</span>
                    <span className="tabular-nums text-t2">{caseCounts.get(status) ?? 0}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="max-w-xl text-[0.8125rem] text-t2">
            The CSV has one row per post with a song in it: who published it, for which brand, the song, the verdict and its reason, and the case. A verdict is a signal for review, not a legal finding.
          </p>
        </>
      )}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <dt className="text-[0.8125rem] text-t2">{label}</dt>
      <dd className={`mt-0.5 text-[1.75rem] leading-none font-semibold tracking-[-0.02em] tabular-nums ${tone ?? "text-tx"}`}>{value}</dd>
    </div>
  );
}

function RankTable({ title, rows }: { title: string; rows: { key: string; name: string; sub: string | null; posts: number; toReview: number; href: string | null }[] }) {
  return (
    <section>
      <h2 className="text-[1.0625rem] font-semibold tracking-[-0.01em]">{title}</h2>
      <table className="mt-3 w-full text-left text-sm">
        <thead>
          <tr className="text-xs text-t2">
            <th scope="col" className="py-2 font-medium">Name</th>
            <th scope="col" className="py-2 text-right font-medium">Posts</th>
            <th scope="col" className="py-2 text-right font-medium">To review</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-line">
              <td className="py-2.5 pr-3">
                {row.href ? (
                  <Link href={row.href} className="font-medium hover:text-accent">{row.name}</Link>
                ) : (
                  <span className="font-medium">{row.name}</span>
                )}
                {row.sub && <span className="text-t2"> by {row.sub}</span>}
              </td>
              <td className="py-2.5 text-right tabular-nums text-t2">{row.posts}</td>
              <td className={`py-2.5 text-right tabular-nums ${row.toReview > 0 ? "font-medium text-mismatch" : "text-t2"}`}>{row.toReview}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
