import { addCreator } from "@/modules/creators";
import { addSong } from "@/modules/catalog";
import {
  DEMO_CAMPAIGNS,
  DEMO_CREATORS,
  DEMO_RIGHTS_RECORDS_BY_TRACK_ID,
  DEMO_TRACKS,
} from "@/modules/demo-data";
import { getCreatorStore } from "./creator-store";
import { getLibraryStore } from "./library-store";
import { getCreatorAllowance } from "./creator-allowance";
import { getAuditStore } from "./audit-store";
import { reassessSong } from "./reassess";

export interface DemoWorkspaceResult {
  creatorsAdded: number;
  songsAdded: number;
  /** The plan ran out before every demo creator was added (or there's no
   *  plan yet). */
  limitReached: boolean;
}

/**
 * "Try it with demo data" (Brief §48, §62): puts the demo dataset's own
 * pieces into a workspace — its 48 creators (the six the Brief names
 * first), Northstar's six songs with the rights records the scan scenarios
 * run into, and the two campaigns those records and creators need — so a
 * first scan shows every verdict the Rights Engine gives, at the scale
 * Brief §48 describes. Only what's missing is added, as far as
 * the plan allows: a song already in the catalogue keeps its own rights
 * records, and nothing the workspace already has is changed.
 *
 * Callers allow this in demo mode only; it never touches a real connector.
 */
export async function loadDemoWorkspace(workspaceId: string, actorUserId: string): Promise<DemoWorkspaceResult> {
  const creatorRepository = getCreatorStore().creators;
  const library = getLibraryStore();
  const audit = getAuditStore().auditLogs;

  // Creators.
  const allowance = await getCreatorAllowance(workspaceId);
  let creatorsAdded = 0;
  let limitReached = false;
  for (const creator of DEMO_CREATORS) {
    const result = await addCreator(
      {
        workspaceId,
        username: creator.handle,
        displayName: creator.displayName,
        country: creator.country,
        followerCount: creator.followerCount,
      },
      { creatorRepository, allowance },
    );
    if (result.ok) {
      creatorsAdded += 1;
      await audit.create({
        workspaceId,
        actorId: actorUserId,
        action: result.restored ? "creator.restored" : "creator.added",
        targetType: "creator",
        targetId: result.creator.id,
        metadata: { handle: result.creator.handle },
      });
    } else if (result.error === "NO_PLAN" || result.error === "LIMIT_REACHED") {
      limitReached = true;
      break;
    }
  }

  // Campaigns, and the creators signed to them.
  const campaignIdByFixtureId = new Map<string, string>();
  for (const fixture of Object.values(DEMO_CAMPAIGNS)) {
    const campaign = await library.campaigns.ensure(workspaceId, fixture.name);
    campaignIdByFixtureId.set(fixture.id, campaign.id);
    for (const handle of fixture.members) {
      const creator = await creatorRepository.findByExternalId(workspaceId, "TIKTOK", handle);
      if (creator && !creator.removedAt && !campaign.creatorIds.includes(creator.id)) {
        await library.campaigns.addCreator(workspaceId, campaign.id, creator.id);
      }
    }
  }

  // Songs, with their rights records.
  let songsAdded = 0;
  for (const track of Object.values(DEMO_TRACKS)) {
    const result = await addSong(
      { workspaceId, title: track.title, artist: track.artist, isrc: track.isrc, source: "demo" },
      { catalogRepository: library.catalog },
    );
    if (!result.ok) continue;
    songsAdded += 1;
    await audit.create({
      workspaceId,
      actorId: actorUserId,
      action: "song.added",
      targetType: "song",
      targetId: result.track.id,
      metadata: { title: result.track.title, artist: result.track.artist },
    });

    const existing = await library.rights.findForTrack(workspaceId, result.track.id);
    if (existing.length === 0) {
      for (const record of DEMO_RIGHTS_RECORDS_BY_TRACK_ID[track.trackId] ?? []) {
        await library.rights.create({
          workspaceId,
          trackId: result.track.id,
          territories: record.territories,
          commercial: record.commercialUsageAllowed,
          organic: record.organicUsageAllowed,
          startDate: record.startDate,
          endDate: record.endDate,
          campaignIds: record.campaignIds.flatMap((id) => campaignIdByFixtureId.get(id) ?? []),
          notes: null,
          source: "Demo data",
        });
      }
    }
    // A scan may have found it already, as someone else's song.
    if (result.wasIdentified) await reassessSong(workspaceId, result.track.id, actorUserId);
  }

  return { creatorsAdded, songsAdded, limitReached };
}
