import { getDemoScanResults } from "@/app/_lib/get-demo-scan-results";
import { AppHeader } from "@/components/layout/app-header";

export const metadata = {
  title: "Creators — RightsWatch",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function CreatorsPage() {
  const scans = await getDemoScanResults();

  const creators = scans.map((scan) => {
    const assessed = scan.items.filter((item) => item.kind === "ASSESSED");
    const flagged = assessed.filter((item) => item.assessment.status !== "CLEARED");
    const mostRecent = scan.items.reduce<Date | null>((latest, item) => {
      return !latest || item.content.publishedAt > latest
        ? item.content.publishedAt
        : latest;
    }, null);

    return {
      creatorExternalId: scan.creatorExternalId,
      creatorUsername: scan.creatorUsername,
      totalItems: scan.items.length,
      flaggedCount: flagged.length,
      mostRecent,
    };
  });

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="creators" />

      <main className="mx-auto w-full max-w-(--content-width) flex-1 px-6 py-8 [--content-width:1100px]">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Creators</h1>
          <p className="mt-1 text-sm text-t2">
            Every creator RightsWatch is monitoring for unlicensed commercial
            use. Example data — connecting a real workspace adds creators
            from your own campaigns.
          </p>
        </div>

        <section className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[0.8125rem] text-t2">
                  <th className="px-5 py-3 font-medium">Creator</th>
                  <th className="px-5 py-3 font-medium">Platform</th>
                  <th className="px-5 py-3 font-medium">Content scanned</th>
                  <th className="px-5 py-3 font-medium">Needs attention</th>
                  <th className="px-5 py-3 font-medium">Most recent activity</th>
                </tr>
              </thead>
              <tbody>
                {creators.map((creator) => (
                  <tr
                    key={creator.creatorExternalId}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-5 py-3.5 text-tx">@{creator.creatorUsername}</td>
                    <td className="px-5 py-3.5 text-t2">TikTok</td>
                    <td className="px-5 py-3.5 text-t2">{creator.totalItems}</td>
                    <td className="px-5 py-3.5">
                      {creator.flaggedCount > 0 ? (
                        <span className="font-medium text-mismatch">
                          {creator.flaggedCount}
                        </span>
                      ) : (
                        <span className="text-t2">0</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-t2">
                      {creator.mostRecent ? dateFormatter.format(creator.mostRecent) : "—"}
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
