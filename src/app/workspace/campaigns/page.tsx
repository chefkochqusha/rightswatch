import Link from "next/link";
import { requireSession } from "@/app/_lib/current-user";
import { canManageCases } from "@/app/_lib/authorize";
import { getLibraryStore } from "@/app/_lib/library-store";
import { getCreatorStore } from "@/app/_lib/creator-store";
import { PageHeader } from "@/components/ui/page-header";
import { AddCreator, CreateCampaign, DeleteCampaign, RemoveCreator, RenameCampaign } from "./campaign-controls";

export const metadata = {
  title: "Campaigns — Bekvor",
};

/**
 * Campaigns (Brief §2: "assign creators to campaigns/projects"). A rights
 * record can be limited to campaigns; a post counts for a campaign when its
 * creator is on it. Analysts and up manage them (`campaigns/actions.ts`);
 * viewers see the list.
 */
export default async function CampaignsPage() {
  const session = await requireSession();
  const workspaceId = session.workspace.id;
  const canManage = canManageCases(session.role);
  const library = getLibraryStore();

  const [campaigns, creators, records] = await Promise.all([
    library.campaigns.findForWorkspace(workspaceId),
    getCreatorStore().creators.findForWorkspace(workspaceId),
    library.rights.findForWorkspace(workspaceId),
  ]);
  const creatorById = new Map(creators.map((creator) => [creator.id, creator]));
  const watchlist = creators.filter((creator) => !creator.removedAt).sort((a, b) => a.handle.localeCompare(b.handle));
  const recordsUsing = (campaignId: string) => records.filter((record) => record.campaignIds.includes(campaignId)).length;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Campaigns"
        description="Group creators by campaign. A rights record can be limited to some campaigns; a post counts for a campaign when its creator is on it."
      />

      {canManage && (
        <section aria-labelledby="new-campaign" className="rounded-lg border border-line bg-surface p-5">
          <h2 id="new-campaign" className="text-sm font-semibold">New campaign</h2>
          <div className="mt-3">
            <CreateCampaign />
          </div>
        </section>
      )}

      {campaigns.length === 0 ? (
        <p className="text-sm text-t2">No campaigns yet. Every rights record then covers all of a creator&apos;s posts.</p>
      ) : (
        <ul className="space-y-6">
          {campaigns.map((campaign) => {
            const members = campaign.creatorIds
              .map((id) => creatorById.get(id))
              .filter((creator) => creator !== undefined)
              .sort((a, b) => a.handle.localeCompare(b.handle));
            const addable = watchlist
              .filter((creator) => !campaign.creatorIds.includes(creator.id))
              .map((creator) => ({ id: creator.id, label: `@${creator.handle}${creator.displayName ? ` (${creator.displayName})` : ""}` }));
            const using = recordsUsing(campaign.id);
            return (
              <li key={campaign.id}>
                <section aria-labelledby={`campaign-${campaign.id}`} className="overflow-hidden rounded-lg border border-line bg-surface">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                    <div className="min-w-0">
                      <h2 id={`campaign-${campaign.id}`} className="text-[0.9375rem] font-semibold text-tx">{campaign.name}</h2>
                      <p className="mt-0.5 text-[0.8125rem] text-t2">
                        {members.length === 1 ? "1 creator" : `${members.length} creators`}
                        {" · "}
                        {using === 0 ? "no rights record limited to it" : using === 1 ? "1 rights record limited to it" : `${using} rights records limited to it`}
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex flex-wrap gap-2">
                        <RenameCampaign campaignId={campaign.id} name={campaign.name} />
                        <DeleteCampaign campaignId={campaign.id} name={campaign.name} creators={members.length} />
                      </div>
                    )}
                  </div>
                  {members.length > 0 && (
                    <ul className="divide-y divide-line">
                      {members.map((creator) => (
                        <li key={creator.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                          <Link href={`/workspace/creators/${encodeURIComponent(creator.id)}`} className="min-w-0 font-medium text-tx hover:underline">
                            @{creator.handle}
                            {creator.displayName && <span className="ml-1.5 font-normal text-t2">{creator.displayName}</span>}
                            {creator.removedAt && <span className="ml-1.5 font-normal text-t2">(removed from the watchlist)</span>}
                          </Link>
                          {canManage && (
                            <RemoveCreator campaignId={campaign.id} creatorId={creator.id} label={`@${creator.handle}`} campaignName={campaign.name} />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canManage && (
                    <div className="border-t border-line px-5 py-4">
                      {addable.length > 0 ? (
                        <AddCreator campaignId={campaign.id} name={campaign.name} options={addable} />
                      ) : (
                        <p className="text-[0.8125rem] text-t2">
                          {watchlist.length === 0 ? (
                            <>Add creators to your <Link href="/workspace/creators" className="underline">watchlist</Link> first.</>
                          ) : (
                            "Every creator on your watchlist is on this campaign."
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </section>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
