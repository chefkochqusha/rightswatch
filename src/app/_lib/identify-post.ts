import { toRightsRecordInput } from "@/modules/rights";
import type { StoredScanItem } from "@/modules/scan-results";
import { getAuditStore } from "./audit-store";
import { openCasesForFlaggedItems } from "./case-automation";
import { getLibraryStore } from "./library-store";
import { makeAssessor } from "./reassess";
import { getScanResultStore } from "./scan-result-store";

export type IdentifyPostResult =
  | { ok: true; item: StoredScanItem; casesOpened: number }
  | { ok: false; error: "NO_SUCH_POST" | "NOT_IN_CATALOGUE" | "ALREADY_IDENTIFIED" };

/**
 * A person says which of the workspace's own songs a post uses (Brief §1,
 * ManualMusicIdentification) — for a post no provider could identify, which
 * is every real post until audio recognition is connected. The post is then
 * assessed like any other, a case opens if it isn't cleared, and the audit
 * log records who identified what.
 *
 * Only a post with no song yet can be identified this way: correcting one a
 * provider found would hide that identification, so it isn't offered.
 */
export async function identifyPostSong(input: {
  workspaceId: string;
  actorUserId: string;
  externalContentId: string;
  trackId: string;
}): Promise<IdentifyPostResult> {
  const { workspaceId } = input;
  const results = getScanResultStore().results;

  const existing = await results.findByContentId(workspaceId, input.externalContentId);
  if (!existing) return { ok: false, error: "NO_SUCH_POST" };
  if (existing.kind === "ASSESSED" || existing.kind === "OTHER_MUSIC") return { ok: false, error: "ALREADY_IDENTIFIED" };

  const library = getLibraryStore();
  const track = await library.catalog.findById(workspaceId, input.trackId);
  if (!track?.inCatalogue) return { ok: false, error: "NOT_IN_CATALOGUE" };

  const rightsRecords = (await library.rights.findForTrack(workspaceId, track.id)).map(toRightsRecordInput);
  const item = await results.identifyPost({
    workspaceId,
    externalContentId: input.externalContentId,
    track: { id: track.id, title: track.title, artist: track.artist, isrc: track.isrc },
    assess: makeAssessor(workspaceId, rightsRecords),
  });
  if (!item) return { ok: false, error: "NO_SUCH_POST" };

  await getAuditStore().auditLogs.create({
    workspaceId,
    actorId: input.actorUserId,
    action: "post.song_identified",
    targetType: "content",
    targetId: input.externalContentId,
    metadata: { trackId: track.id, title: track.title },
  });
  const casesOpened = await openCasesForFlaggedItems(workspaceId, input.actorUserId, [item]);
  return { ok: true, item, casesOpened };
}
