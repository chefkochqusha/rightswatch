import Link from "next/link";
import { getDemoSnapshot } from "@/app/_lib/get-demo-scan-results";
import { AppHeader } from "@/components/layout/app-header";
import { KeywordMarquee } from "@/components/marketing/keyword-marquee";
import { StatusBadge } from "@/components/ui/status-badge";
import { REASON_LABELS, STATUS_SORT_ORDER, formatConfidence } from "@/components/rights/labels";
import type { RightsAssessmentStatus } from "@/modules/rights-engine/types";
import type { DemoSnapshotItem } from "@/modules/scan-pipeline/demo-snapshot";

export const metadata = {
  title: "Dashboard — RightsWatch",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

// Task #64's marquee content. Row 1: the Brief's own four target customer
// segments (§1), worded for a banner rather than a bullet list. Row 2: what
// the product actually does, held to the same cautious, non-legal-verdict
// voice as every other line of copy in the app (DESIGN_SYSTEM.md "Copy &
// tone") — "signal," "flags," "surfaces," never "catches" or "proves."
const AUDIENCE_KEYWORDS = [
  "MUSIC PUBLISHERS",
  "LICENSING AGENCIES",
  "RIGHTS MANAGERS",
  "BRAND & AGENCY TEAMS",
] as const;

const CAPABILITY_KEYWORDS = [
  "MONITORS TIKTOK CONTENT",
  "FLAGS COMMERCIAL USE",
  "SURFACES RIGHTS MISMATCHES",
  "SIGNALS WHAT NEEDS REVIEW",
] as const;

/**
 * Demo Mode's dashboard (Brief §7, §48): the demo snapshot's headline
 * numbers, where its music matches stand, and every match, most urgent
 * first. Posts with no identified track count as videos checked but aren't
 * listed — there's nothing to assess in them.
 */
export default async function DashboardPage() {
  const { items, counts: totals } = await getDemoSnapshot();

  const rows = items.filter(
    (item): item is Extract<DemoSnapshotItem, { kind: "ASSESSED" }> => item.kind === "ASSESSED",
  );
  rows.sort((a, b) => {
    const rank = STATUS_SORT_ORDER[a.assessment.status] - STATUS_SORT_ORDER[b.assessment.status];
    return rank !== 0 ? rank : b.content.publishedAt.getTime() - a.content.publishedAt.getTime();
  });

  const counts: Record<RightsAssessmentStatus, number> = {
    CLEARED: 0,
    REVIEW: 0,
    POTENTIAL_MISMATCH: 0,
    UNKNOWN: 0,
  };
  for (const row of rows) counts[row.assessment.status] += 1;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="dashboard" />

      <section className="overflow-hidden border-b border-line bg-surface-2">
        {/* The two rows below are a purely visual, `aria-hidden` marquee —
            each word list renders twice over for the seamless scroll loop,
            which would read as garbled, repeated nonsense to a screen
            reader. This sentence is the one place that information exists
            in the accessibility tree, since nothing else on this page
            states it in plain text either. */}
        <p className="sr-only">
          Built for music publishers, licensing agencies, rights managers, and
          brand and agency teams. RightsWatch monitors TikTok content, flags
          commercial use, surfaces rights mismatches, and signals what needs
          review.
        </p>
        <div className="space-y-3 py-5">
          <KeywordMarquee items={AUDIENCE_KEYWORDS} direction="left" />
          <KeywordMarquee items={CAPABILITY_KEYWORDS} direction="right" />
        </div>
      </section>

      <main className="mx-auto w-full max-w-(--content-width) flex-1 px-6 py-8 [--content-width:1100px]">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-t2">
            Northstar Music Publishing, a fictional publisher, after a demo scan of September 2026.
            Every creator, track and match here is a demo record — no live TikTok data is shown.
          </p>
        </div>

        <section
          aria-label="Key figures"
          className="mb-6 grid grid-cols-2 gap-x-6 gap-y-5 rounded-lg border border-line bg-surface px-5 py-5 sm:grid-cols-3 lg:grid-cols-5"
        >
          <Figure label="Monitored creators" value={totals.monitoredCreators} />
          <Figure label="New commercial videos" value={totals.videos} note="last 30 days" />
          <Figure label="Music matches" value={totals.musicMatches} note={`${totals.newMatches} new this week`} />
          <Figure label="Open cases" value={totals.openCases} note="need a decision" />
          <Figure label="High-priority reviews" value={counts.POTENTIAL_MISMATCH} note="potential mismatches" />
        </section>

        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Potential mismatches" count={counts.POTENTIAL_MISMATCH} tone="mismatch" />
          <StatCard label="Needs review" count={counts.REVIEW} tone="review" />
          <StatCard label="Unknown" count={counts.UNKNOWN} tone="unknown" />
          <StatCard label="Cleared" count={counts.CLEARED} tone="cleared" />
        </div>

        <section className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-sm font-semibold">Music matches</h2>
            <p className="mt-0.5 text-[0.8125rem] text-t2">
              Every commercial video a catalogue track was identified in, most urgent first. Match
              confidence is confidence in the music identification, not that an infringement
              occurred.
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
                  <th className="px-5 py-3 font-medium">Confidence</th>
                  <th className="px-5 py-3 font-medium">Published</th>
                  <th className="px-5 py-3 font-medium">Detail</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.content.externalContentId} className="border-b border-line last:border-0">
                    <td className="px-5 py-3.5 align-top">
                      <StatusBadge status={row.assessment.status} />
                    </td>
                    <td className="px-5 py-3.5 align-top whitespace-nowrap text-tx">
                      @{row.creator.handle}
                    </td>
                    <td className="px-5 py-3.5 align-top text-t2">
                      {row.content.brandNames.join(", ") || "—"}
                    </td>
                    <td className="px-5 py-3.5 align-top">
                      <div className="text-tx">{row.musicMatch.title}</div>
                      <div className="text-[0.8125rem] text-t2">{row.musicMatch.artist}</div>
                    </td>
                    <td className="px-5 py-3.5 align-top whitespace-nowrap text-t2 tabular-nums">
                      {formatConfidence(row.musicMatch.confidence)}
                    </td>
                    <td className="px-5 py-3.5 align-top whitespace-nowrap text-t2">
                      {dateFormatter.format(row.content.publishedAt)}
                    </td>
                    <td className="px-5 py-3.5 align-top text-t2">
                      {row.assessment.reason ? REASON_LABELS[row.assessment.reason] : "—"}
                    </td>
                    <td className="px-5 py-3.5 align-top whitespace-nowrap">
                      <Link
                        href={`/assessments/${encodeURIComponent(row.content.externalContentId)}`}
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

function Figure({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div>
      <div className="text-xs tracking-[0.02em] text-t2">{label}</div>
      <div className="mt-1 text-[2.25rem] leading-[1.05] font-semibold tracking-[-0.025em] tabular-nums">{value}</div>
      {note && <div className="mt-1 text-xs text-t2">{note}</div>}
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
