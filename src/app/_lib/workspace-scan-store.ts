import { runScan } from "@/modules/scan-pipeline";
import type { ScanItemResult } from "@/modules/scan-pipeline";
import { MockTikTokConnector } from "@/modules/connectors";
import { FixtureMusicIdentificationProvider } from "@/modules/music";
import { FixtureRightsRepository } from "@/modules/rights";
import { FixtureCampaignRepository } from "@/modules/campaigns";
import { openCase } from "@/modules/cases";
import { notifyCaseOpened } from "@/modules/notifications";
import { getCaseStore } from "./case-store";
import { getNotificationStore } from "./notification-store";
import { getAuthStore } from "./auth-store";
import { getAuditStore } from "./audit-store";

/**
 * Per-workspace "sample scan" results for the real, authenticated app —
 * distinct from `get-demo-scan-results.ts` (which recomputes fresh, from
 * scratch, on every request, for the public Demo Mode) even though both
 * call the exact same `runScan()` pipeline against the exact same mock
 * connector and fixture providers.
 *
 * Why this exists: a freshly signed-up workspace has no real TikTok
 * connection yet (Phase 10 is still gated on API access), so it would
 * otherwise sit completely empty. Rather than leave it inert, a user can
 * click "Run a sample scan" and see what a real scan run would produce,
 * *persisted to their own workspace* rather than recomputed anonymously
 * like the public demo — which is what makes opening real Cases against
 * these items meaningful (Case.workspaceId is real, and the acting user
 * is a real, logged-in session, not an anonymous demo visitor). The only
 * thing Phase 10 changes is swapping `MockTikTokConnector` for the real
 * one and this in-memory Map for a Prisma-backed `CommercialContent`/
 * `MusicMatch`/`RightsAssessment` table — the pipeline call itself
 * doesn't change at all.
 *
 * Cached on `globalThis` for the same reason as `auth-store.ts`: shared
 * across requests within a server process, lost on restart/redeploy,
 * never shared across serverless instances. Not for production use.
 *
 * `runSampleScanForWorkspace` also carries out the scan pipeline's
 * documented next step in full (`scan-pipeline/types.ts`: "Rights Engine →
 * Case Creation → Notifications") — it's this app's stand-in for the whole
 * scan job, not just the Rights Engine step, so a flagged item is already
 * tracked as a Case the moment a scan finds it, and every workspace member
 * already has an in-app notification about it, not only once a human
 * notices and clicks "Open a case". Notifications are in-app only, not
 * email — this project has no email-sending mechanism (same reason
 * `invite-teammate.ts`'s invite links are shown in-app to copy rather than
 * emailed), so in-app is the one channel with no external dependency to
 * stand up first.
 */

const DEMO_CREATORS = [
  { creatorExternalId: "demo-creator-1", creatorUsername: "mia.dances" },
  { creatorExternalId: "demo-creator-2", creatorUsername: "leon.fit" },
  { creatorExternalId: "demo-creator-3", creatorUsername: "noah.cooks" },
  { creatorExternalId: "demo-creator-4", creatorUsername: "priya.beauty" },
] as const;

// Wide enough to include every fixture regardless of when "today" is.
const SINCE = new Date("2000-01-01");
const UNTIL = new Date("2100-01-01");

// An intersection, not `interface ... extends`, for the same reason as
// `DemoAssessmentRow` in `get-demo-scan-results.ts`: `ScanItemResult` is a
// discriminated union.
export type WorkspaceScanItem = ScanItemResult & {
  creatorExternalId: string;
  creatorUsername: string;
};

interface WorkspaceScanStore {
  itemsByWorkspaceId: Map<string, WorkspaceScanItem[]>;
}

const globalForScans = globalThis as unknown as { __rightswatchWorkspaceScans?: WorkspaceScanStore };

function getStore(): WorkspaceScanStore {
  if (!globalForScans.__rightswatchWorkspaceScans) {
    globalForScans.__rightswatchWorkspaceScans = { itemsByWorkspaceId: new Map() };
  }
  return globalForScans.__rightswatchWorkspaceScans;
}

export function getWorkspaceScanItems(workspaceId: string): WorkspaceScanItem[] {
  return getStore().itemsByWorkspaceId.get(workspaceId) ?? [];
}

export function getWorkspaceScanItem(
  workspaceId: string,
  contentId: string,
): WorkspaceScanItem | null {
  const items = getWorkspaceScanItems(workspaceId);
  return items.find((item) => item.content.externalContentId === contentId) ?? null;
}

/**
 * A stand-in for a persisted `RightsAssessment.id`. `RightsAssessment` is
 * modeled in the Prisma schema, but nothing writes a real row to it: the
 * Rights Engine's inputs (the `rights`/`campaigns`/`music` modules) are
 * still fixture-backed, not workspace-scoped Prisma queries — a bigger,
 * not-yet-decided swap than `Case` itself (see `ARCHITECTURE.md` → "Open
 * decisions" → Data layer). So `runScan()`'s output stays a pure,
 * unpersisted `RightsAssessmentResult` with no id of its own — but
 * `openCase()` needs *some* stable identifier to key the 1:1
 * Case<->RightsAssessment relationship on, and `Case.rightsAssessmentId` is
 * a real, `@unique` Prisma column now.
 *
 * `externalContentId` alone isn't enough: every workspace's sample scan
 * runs the exact same `MockTikTokConnector` fixtures, so the same
 * `externalContentId` values recur identically across every workspace.
 * Without the `workspaceId` prefix, two different workspaces opening a
 * case against "the same" fixture content would collide in the shared
 * `Case` table (workspace B's `findByRightsAssessmentId` would find
 * workspace A's case). Namespacing by workspace keeps the 1:1 uniqueness
 * scoped the way a real per-workspace-scoped `RightsAssessment` row would
 * be — and it's stable across re-scans, since the fixture content ids
 * never change, so re-running a sample scan never orphans an open case.
 */
export function getRightsAssessmentId(workspaceId: string, contentId: string): string {
  return `${workspaceId}::${contentId}`;
}

/**
 * The inverse of `getRightsAssessmentId` — recovers the original
 * `externalContentId` from an id this function produced, given the same
 * `workspaceId` the id was minted for. Added for the audit log page
 * (`app/workspace/audit/page.tsx`), which only ever has a `Case.
 * rightsAssessmentId` to work with and needs the real content id back to
 * link to `workspace/items/[contentId]`.
 *
 * Returns `null` — never throws or guesses — for anything that isn't
 * actually one of this workspace's ids (a different workspace's id, or a
 * string that predates this format entirely), since a caller decoding ids
 * it didn't itself just mint needs "not one of ours" to be an ordinary,
 * renderable outcome rather than a crash.
 */
export function getContentIdFromRightsAssessmentId(
  workspaceId: string,
  rightsAssessmentId: string,
): string | null {
  const prefix = `${workspaceId}::`;
  return rightsAssessmentId.startsWith(prefix) ? rightsAssessmentId.slice(prefix.length) : null;
}

export async function runSampleScanForWorkspace(
  workspaceId: string,
  /** The user who clicked "Run a sample scan" — threaded through only so
   *  any case this run opens can be audit-logged against a real actor
   *  rather than `null`. Nothing else in this function needs it. */
  triggeredByUserId: string,
): Promise<WorkspaceScanItem[]> {
  const connector = new MockTikTokConnector();
  const musicProvider = new FixtureMusicIdentificationProvider();
  const rightsRepository = new FixtureRightsRepository();
  const campaignRepository = new FixtureCampaignRepository();

  const perCreator = await Promise.all(
    DEMO_CREATORS.map(async (creator) => {
      const result = await runScan({
        connector,
        musicProvider,
        getRightsRecordsForTrack: (trackId) => rightsRepository.getRecordsForTrack(trackId),
        getCampaignIdsForCreator: async (creatorExternalId) =>
          (await campaignRepository.findForCreator(creatorExternalId)).map((c) => c.id),
        creatorExternalId: creator.creatorExternalId,
        creatorUsername: creator.creatorUsername,
        since: SINCE,
        until: UNTIL,
      });
      return result.items.map((item) => ({ ...item, ...creator }));
    }),
  );

  const items = perCreator.flat();
  getStore().itemsByWorkspaceId.set(workspaceId, items);

  // Case Creation: only for items the Rights Engine actually flagged — a
  // CLEARED assessment has nothing to investigate. `openCase` is idempotent
  // (see its own doc comment), so re-running a sample scan never duplicates
  // an already-open case or disturbs one a human has since moved to
  // RESOLVED/DISMISSED; it only fills in cases for items that don't have
  // one yet.
  const caseRepository = getCaseStore().cases;
  // Notification recipients: every current member of the workspace, not
  // just OWNER/ADMIN/ANALYST. A notification is visibility, not a mutation
  // — this app has never gated case *visibility* by role (only the
  // mutations, via `authorize.ts`'s `canManageCases`), and the workspace
  // scan table itself is already visible to a VIEWER, so hearing about a
  // new case is consistent with that, even though a VIEWER can't act on it.
  // Looked up once per scan (a workspace's membership doesn't change
  // mid-scan), not once per flagged item.
  const memberships = await getAuthStore().memberships.findForWorkspace(workspaceId);
  const recipientUserIds = memberships.map((m) => m.userId);
  const notificationRepository = getNotificationStore().notifications;

  for (const item of items) {
    if (item.kind === "ASSESSED" && item.assessment.status !== "CLEARED") {
      const result = await openCase(
        {
          workspaceId,
          rightsAssessmentId: getRightsAssessmentId(workspaceId, item.content.externalContentId),
        },
        { caseRepository },
      );
      // Only notify for a genuinely new case. `openCase`'s idempotency
      // already tells us whether this is the first time this assessment
      // has ever had a case — reusing that signal here is what keeps
      // re-running a sample scan from re-notifying everyone about a case
      // that's been sitting there, possibly already resolved, since
      // yesterday.
      if (result.created) {
        await notifyCaseOpened(
          {
            workspaceId,
            recipientUserIds,
            payload: {
              caseId: result.case.id,
              contentId: item.content.externalContentId,
              creatorUsername: item.creatorUsername,
              status: item.assessment.status,
            },
          },
          { notificationRepository },
        );
        // Same `result.created` guard as the notification above, and the
        // same audit action/targetType this app's other real case-opening
        // path writes (`app/workspace/items/[contentId]/case-actions.ts`'s
        // `openCaseAction`) — this is actually the more common of the two
        // in practice, since a scan auto-opens a case for every flagged
        // item, and the manual "Open a case" button only ever shows up for
        // the items this loop skips (already-open, or CLEARED).
        await getAuditStore().auditLogs.create({
          workspaceId,
          actorId: triggeredByUserId,
          action: "case.opened",
          targetType: "case",
          targetId: result.case.id,
        });
      }
    }
  }

  return items;
}
