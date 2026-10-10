"use server";

import { recordAudit } from "@/app/_lib/audit-event";
import { getSessionSecret } from "@/app/_lib/session-cookie";
import { requireWorkspaceManager } from "@/app/_lib/authorize";
import { inviteTeammate } from "@/modules/auth";
import type { Role } from "@/modules/auth";
import { inviteEmail } from "@/modules/email";
import { getAppBaseUrl, getEmailSender } from "@/app/_lib/email";
import { ROLE_LABELS } from "@/components/team/labels";
import { log } from "@/app/_lib/log";
import { seatCheck } from "@/app/_lib/plan-limits";

export interface InviteTeammateFormState {
  fieldErrors?: Partial<Record<"email" | "role", string>>;
  formError?: string;
  /** Set on success — the raw invite token, turned into a shareable link by
   *  the client component, so it can also be sent by hand. */
  issuedToken?: string;
  invitedEmail?: string;
  /** The invite was also emailed (only when this server sends email). */
  emailed?: boolean;
}

export async function inviteTeammateAction(
  _prevState: InviteTeammateFormState,
  formData: FormData,
): Promise<InviteTeammateFormState> {
  const email = String(formData.get("email") ?? "");
  const role = String(formData.get("role") ?? "") as Role;

  const session = await requireWorkspaceManager();
  const seats = await seatCheck(session.workspace.id);
  if (!seats.ok) return { formError: seats.message };
  const result = await inviteTeammate(
    {
      workspaceId: session.workspace.id,
      workspaceName: session.workspace.name,
      email,
      role,
    },
    { secret: getSessionSecret() },
  );

  if (!result.ok) {
    if (result.error === "INVALID_EMAIL") {
      return { fieldErrors: { email: "Enter a valid email address." } };
    }
    return { fieldErrors: { role: "Choose a role to invite them as." } };
  }

  const invitedEmail = email.trim().toLowerCase();
  await recordAudit({ workspaceId: session.workspace.id, actorId: session.user.id, action: "team.invited", targetType: "invite", targetId: invitedEmail, metadata: { role } });
  let emailed = false;
  const sender = getEmailSender();
  const baseUrl = await getAppBaseUrl();
  if (sender.mode !== "OUTBOX" && baseUrl) {
    try {
      await sender.send(
        inviteEmail({
          to: invitedEmail,
          workspaceName: session.workspace.name,
          inviterName: session.user.name ?? session.user.email,
          roleLabel: ROLE_LABELS[role] ?? role,
          link: `${baseUrl}/invite/accept?token=${encodeURIComponent(result.token)}`,
        }),
      );
      emailed = true;
    } catch (error) {
      // The link is still shown to copy; say nothing personal in the log.
      log("warn", "invite.email_failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { issuedToken: result.token, invitedEmail, emailed };
}
