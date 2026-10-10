"use server";

import { recordAudit } from "@/app/_lib/audit-event";
import { getSessionSecret } from "@/app/_lib/session-cookie";
import { requireWorkspaceManager } from "@/app/_lib/authorize";
import { revalidatePath } from "next/cache";
import { changeMemberRole, inviteTeammate, removeMember, transferOwnership } from "@/modules/auth";
import type { ManageMemberError, RateLimiter, Role } from "@/modules/auth";
import { getAuthStore } from "@/app/_lib/auth-store";
import { createRateLimiter } from "@/app/_lib/rate-limit-store";
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

// Managing members after they joined: roles, removal, ownership (modules/auth/manage-members.ts).

export interface MemberActionState {
  error?: string;
  done?: string;
}

const MANAGE_ERRORS: Record<ManageMemberError, string> = {
  FORBIDDEN: "Only owners and admins can manage the team.",
  NOT_A_MEMBER: "That person isn't in this workspace any more.",
  SELF: "You can't change your own access here. To leave, delete your account in Settings.",
  OWNER: "The owner's access can only change by handing the workspace over.",
  INVALID_ROLE: "Choose Admin, Analyst or Viewer.",
};

function memberDeps() {
  const store = getAuthStore();
  return { membershipRepository: store.memberships, accountRepository: store.accounts, sessionRepository: store.sessions, userRepository: store.users };
}

export async function changeMemberRoleAction(_previous: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const session = await requireWorkspaceManager();
  const targetUserId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  const result = await changeMemberRole({ actorId: session.user.id, workspaceId: session.workspace.id, targetUserId, role }, memberDeps());
  if (!result.ok) return { error: MANAGE_ERRORS[result.error] };
  if (result.previousRole !== role) {
    await recordAudit({ workspaceId: session.workspace.id, actorId: session.user.id, action: "team.role_changed", targetType: "user", targetId: targetUserId, metadata: { from: result.previousRole, to: role } });
  }
  revalidatePath("/workspace/team");
  return { done: `Role changed to ${ROLE_LABELS[role as Role]}.` };
}

export async function removeMemberAction(_previous: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const session = await requireWorkspaceManager();
  const targetUserId = String(formData.get("userId") ?? "");
  const result = await removeMember({ actorId: session.user.id, workspaceId: session.workspace.id, targetUserId }, memberDeps());
  if (!result.ok) return { error: MANAGE_ERRORS[result.error] };
  await recordAudit({ workspaceId: session.workspace.id, actorId: session.user.id, action: "team.removed", targetType: "user", targetId: targetUserId, metadata: { role: result.previousRole } });
  revalidatePath("/workspace/team");
  return { done: "Removed." };
}

const globalForTransfer = globalThis as unknown as { __rightswatchTransferLimiter?: RateLimiter };

export async function transferOwnershipAction(_previous: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const session = await requireWorkspaceManager();
  const targetUserId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  const rateLimiter = (globalForTransfer.__rightswatchTransferLimiter ??= createRateLimiter("transfer-ownership", { maxAttempts: 5 }));
  const result = await transferOwnership({ ownerId: session.user.id, workspaceId: session.workspace.id, targetUserId, password }, { ...memberDeps(), rateLimiter });
  if (!result.ok) {
    const messages = {
      FORBIDDEN: "Only the owner can hand the workspace over.",
      NOT_A_MEMBER: "That person isn't in this workspace any more.",
      SELF: "You already own this workspace.",
      NOT_AN_ADMIN: "Make them an admin first; ownership goes to an admin.",
      WRONG_PASSWORD: "That isn't your password.",
      RATE_LIMITED: "Too many attempts. Try again in 15 minutes.",
    } as const;
    return { error: messages[result.error] };
  }
  await recordAudit({ workspaceId: session.workspace.id, actorId: session.user.id, action: "team.ownership_transferred", targetType: "user", targetId: targetUserId, metadata: null });
  revalidatePath("/workspace", "layout");
  return { done: "Done. You're an admin now." };
}
