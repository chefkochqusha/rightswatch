import { getPrisma } from "@/lib/prisma-client";
import { newCasesEmail } from "@/modules/email";
import { getAuthStore } from "./auth-store";
import { getAppBaseUrl, getEmailSender } from "./email";
import { log } from "./log";

/**
 * Emails about newly opened cases: one email per run (a scan, a song
 * identified, a re-check), not one per case, to every owner, admin and
 * analyst of the workspace who hasn't turned them off (Settings, stored as
 * a `NotificationPreference` with channel "email"). Only when this server
 * sends email. Best effort: a mail problem never fails the run that opened
 * the cases (the in-app notifications are there regardless).
 */

const VERDICT_LABELS: Record<string, string> = {
  POTENTIAL_MISMATCH: "Potential mismatch",
  REVIEW: "Needs review",
  UNKNOWN: "Unknown",
};

export async function sendNewCaseAlerts(
  workspaceId: string,
  opened: { contentId: string; creatorUsername: string; status: string }[],
): Promise<number> {
  if (opened.length === 0) return 0;
  const sender = getEmailSender();
  if (sender.mode === "OUTBOX") return 0;
  let baseUrl: string | null;
  try {
    baseUrl = await getAppBaseUrl();
  } catch {
    baseUrl = process.env.APP_URL?.replace(/\/+$/, "") ?? null; // outside a request (the worker)
  }
  if (!baseUrl) return 0;

  try {
    const store = getAuthStore();
    const workspace = await store.workspaces.findById(workspaceId);
    if (!workspace) return 0;
    const members = (await store.memberships.findForWorkspace(workspaceId)).filter((m) => m.role !== "VIEWER");
    const optedOut = new Set(
      (
        await getPrisma().notificationPreference.findMany({
          where: { userId: { in: members.map((m) => m.userId) }, channel: "email", enabled: false },
          select: { userId: true },
        })
      ).map((p) => p.userId),
    );
    let sent = 0;
    for (const member of members) {
      if (optedOut.has(member.userId)) continue;
      const user = await store.users.findById(member.userId);
      if (!user) continue;
      await sender.send(
        newCasesEmail({
          to: user.email,
          workspaceName: workspace.name,
          cases: opened.map((c) => ({
            creatorUsername: c.creatorUsername,
            verdict: VERDICT_LABELS[c.status] ?? c.status,
            link: `${baseUrl}/workspace/items/${encodeURIComponent(c.contentId)}`,
          })),
          casesLink: `${baseUrl}/workspace/cases`,
          settingsLink: `${baseUrl}/workspace/settings#email-alerts`,
        }),
      );
      sent += 1;
    }
    return sent;
  } catch (error) {
    log("warn", "case_alerts.failed", { workspaceId, error: error instanceof Error ? error.message : String(error) });
    return 0;
  }
}

export async function emailAlertsEnabled(userId: string): Promise<boolean> {
  const pref = await getPrisma().notificationPreference.findUnique({ where: { userId_channel: { userId, channel: "email" } } });
  return pref?.enabled ?? true;
}

export async function setEmailAlerts(userId: string, enabled: boolean): Promise<void> {
  await getPrisma().notificationPreference.upsert({
    where: { userId_channel: { userId, channel: "email" } },
    create: { userId, channel: "email", enabled },
    update: { enabled },
  });
}
