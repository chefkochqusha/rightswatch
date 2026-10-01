import { getDemoScanResults } from "@/app/_lib/get-demo-scan-results";
import { AppHeader } from "@/components/layout/app-header";

export const metadata = {
  title: "Creators — RightsWatch",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const followerFormatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Demo Mode's monitored creators (Brief §8, §48): the 48 demo creators and
 *  what the demo scan found for each. */
export default async function CreatorsPage() {
  const scans = await getDemoScanResults();

  const creators = scans.map(({ creator, items }) => {
    const flagged = items.filter((item) => item.kind === "ASSESSED" && item.assessment.status !== "CLEARED");
    const matches = items.filter((item) => item.kind === "ASSESSED");
    const mostRecent = items.reduce<Date | null>(
      (latest, item) => (!latest || item.content.publishedAt > latest ? item.content.publishedAt : latest),
      null,
    );
    return { creator, videos: items.length, matches: matches.length, flagged: flagged.length, mostRecent };
  });

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="creators" />

      <main className="mx-auto w-full max-w-(--content-width) flex-1 px-6 py-8 [--content-width:1100px]">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Creators</h1>
          <p className="mt-1 text-sm text-t2">
            {creators.length} demo creators monitored for commercial content. Every name here is
            fictional; in your own workspace you add the creators you want to watch.
          </p>
        </div>

        <section className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[0.8125rem] text-t2">
                  <th className="px-5 py-3 font-medium">Creator</th>
                  <th className="px-5 py-3 font-medium">Country</th>
                  <th className="px-5 py-3 font-medium">Followers</th>
                  <th className="px-5 py-3 font-medium">Videos (30 days)</th>
                  <th className="px-5 py-3 font-medium">Music matches</th>
                  <th className="px-5 py-3 font-medium">Needs attention</th>
                  <th className="px-5 py-3 font-medium">Most recent</th>
                </tr>
              </thead>
              <tbody>
                {creators.map(({ creator, videos, matches, flagged, mostRecent }) => (
                  <tr key={creator.handle} className="border-b border-line last:border-0">
                    <td className="px-5 py-3.5">
                      <div className="text-tx">@{creator.handle}</div>
                      <div className="text-[0.8125rem] text-t2">{creator.displayName}</div>
                    </td>
                    <td className="px-5 py-3.5 text-t2">{creator.country ?? "—"}</td>
                    <td className="px-5 py-3.5 text-t2 tabular-nums">
                      {followerFormatter.format(creator.followerCount)}
                    </td>
                    <td className="px-5 py-3.5 text-t2 tabular-nums">{videos}</td>
                    <td className="px-5 py-3.5 text-t2 tabular-nums">{matches}</td>
                    <td className="px-5 py-3.5 tabular-nums">
                      {flagged > 0 ? (
                        <span className="font-medium text-mismatch">{flagged}</span>
                      ) : (
                        <span className="text-t2">0</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-t2">
                      {mostRecent ? dateFormatter.format(mostRecent) : "—"}
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
