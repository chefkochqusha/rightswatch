import { addCaseNote, updateCase } from "@/modules/cases";
import { recordAudit } from "./audit-event";
import { getCaseStore } from "./case-store";
import { getScanResultStore } from "./scan-result-store";

/**
 * "Wrong song": a person withdraws the song identified in a post — by a
 * scan, by Bekvor's recognition or by a colleague. The identification is
 * kept as a record but ignored from now on, so the post has no song again
 * and can be identified anew. A case that hung off it is dismissed, with a
 * note saying why, so the case history stays complete. Audited.
 */
export async function rejectPostSong(input: {
  workspaceId: string;
  actorUserId: string;
  externalContentId: string;
  note: string | null;
}): Promise<{ ok: true; title: string; caseDismissed: boolean } | { ok: false; error: "NO_SONG" }> {
  const rejected = await getScanResultStore().results.rejectIdentification({
    workspaceId: input.workspaceId,
    externalContentId: input.externalContentId,
    rejectedById: input.actorUserId,
    note: input.note,
  });
  if (!rejected) return { ok: false, error: "NO_SONG" };

  let caseDismissed = false;
  if (rejected.rightsAssessmentId) {
    const store = getCaseStore();
    const existing = await store.cases.findByRightsAssessmentId(rejected.rightsAssessmentId);
    if (existing && existing.workspaceId === input.workspaceId) {
      await addCaseNote(
        {
          caseId: existing.id,
          authorId: input.actorUserId,
          body: `The song in this post was identified as “${rejected.title}”, which was wrong; the identification was withdrawn.${input.note ? ` Note: ${input.note}` : ""}`,
        },
        { caseRepository: store.cases, caseNoteRepository: store.notes },
      );
      if (existing.status !== "DISMISSED" && existing.status !== "RESOLVED") {
        await updateCase({ caseId: existing.id, status: "DISMISSED" }, { caseRepository: store.cases });
        caseDismissed = true;
        await recordAudit({
          workspaceId: input.workspaceId,
          actorId: input.actorUserId,
          action: "case.status_changed",
          targetType: "case",
          targetId: existing.id,
          metadata: { from: existing.status, to: "DISMISSED" },
        });
      }
    }
  }
  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorUserId,
    action: "post.song_rejected",
    targetType: "content",
    targetId: input.externalContentId,
    metadata: { trackId: rejected.trackId, title: rejected.title, provider: rejected.provider },
  });
  return { ok: true, title: rejected.title, caseDismissed };
}
