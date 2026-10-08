"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { changePassword, deleteOwnAccount, deleteWorkspace, InMemoryRateLimiter, MIN_PASSWORD_LENGTH } from "@/modules/auth";
import { cancelSubscription } from "@/modules/billing";
import { recordAudit } from "@/app/_lib/audit-event";
import { getAuthStore } from "@/app/_lib/auth-store";
import { getBillingStore } from "@/app/_lib/billing-store";
import { DEMO_WORKSPACE_SLUG } from "@/app/_lib/demo-access";
import { requireSession } from "@/app/_lib/current-user";
import { clearSessionCookie, setSessionCookie } from "@/app/_lib/session-cookie";

export interface ChangePasswordFormState {
  formError?: string;
  done?: boolean;
}

export async function changePasswordAction(_prev: ChangePasswordFormState, formData: FormData): Promise<ChangePasswordFormState> {
  const session = await requireSession();
  // The demo's accounts are shared by every visitor, and nobody can log in to them.
  if (session.workspace.slug === DEMO_WORKSPACE_SLUG) return { formError: "The public demo is view only." };

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next !== confirm) return { formError: "The two new passwords don't match." };

  const store = getAuthStore();
  const result = await changePassword(
    { userId: session.user.id, currentPassword: current, newPassword: next },
    { userRepository: store.users, sessionRepository: store.sessions, rateLimiter: store.loginRateLimiter },
  );
  if (!result.ok) {
    const messages = {
      WRONG_PASSWORD: "That isn't your current password.",
      WEAK_PASSWORD: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
      SAME_PASSWORD: "Choose a password different from the current one.",
      RATE_LIMITED: "Too many wrong attempts. Try again in a few minutes.",
      NO_SUCH_USER: "Your account couldn't be found. Log in again.",
    } as const;
    return { formError: messages[result.error] };
  }

  await recordAudit({ workspaceId: session.workspace.id, actorId: session.user.id, action: "account.password_changed", targetType: "user", targetId: session.user.id });

  // Every session ended, this browser's included: start a fresh one.
  await setSessionCookie(session.user.id);
  revalidatePath("/workspace/settings");
  return { done: true };
}

export interface DeleteWorkspaceFormState {
  formError?: string;
}

// Password guesses on this form: 5 per 15 minutes per account (in memory, per instance, like the login limits).
const globalForDelete = globalThis as unknown as { __rightswatchDeleteLimiter?: InMemoryRateLimiter };
function deleteLimiter() {
  return (globalForDelete.__rightswatchDeleteLimiter ??= new InMemoryRateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 }));
}

/**
 * Deletes the workspace and everything in it, for good. Owner only, with the
 * password and the workspace's name typed out. The subscription is ended
 * first; if that fails nothing is deleted.
 */
export async function deleteWorkspaceAction(_prev: DeleteWorkspaceFormState, formData: FormData): Promise<DeleteWorkspaceFormState> {
  const session = await requireSession();
  if (session.workspace.slug === DEMO_WORKSPACE_SLUG) return { formError: "The public demo can't be deleted." };

  const auth = getAuthStore();
  const billing = getBillingStore();
  let result;
  try {
    result = await deleteWorkspace(
      {
        workspaceId: session.workspace.id,
        actorUserId: session.user.id,
        password: String(formData.get("password") ?? ""),
        confirmName: String(formData.get("confirmName") ?? ""),
      },
      {
        userRepository: auth.users,
        workspaceRepository: auth.workspaces,
        membershipRepository: auth.memberships,
        accountRepository: auth.accounts,
        rateLimiter: deleteLimiter(),
        beforeDelete: async () => {
          await cancelSubscription(
            { workspaceId: session.workspace.id },
            { subscriptionRepository: billing.subscriptions, paymentProvider: billing.paymentProvider },
          );
        },
      },
    );
  } catch {
    // The subscription couldn't be ended, so nothing was deleted.
    return { formError: "We couldn't end your subscription, so nothing was deleted. Try again in a moment." };
  }

  if (!result.ok) {
    const messages = {
      NOT_OWNER: "Only the owner can delete the workspace.",
      WRONG_PASSWORD: "That isn't your password.",
      NAME_MISMATCH: "Type the workspace name exactly as shown.",
      RATE_LIMITED: "Too many wrong attempts. Try again in a few minutes.",
      NO_SUCH_WORKSPACE: "This workspace no longer exists.",
    } as const;
    return { formError: messages[result.error] };
  }

  await clearSessionCookie();
  redirect("/login?deleted=1");
}

export interface DeleteAccountFormState {
  formError?: string;
}

/**
 * A member (not the owner) deletes their own account for good. The workspace
 * keeps their case notes and activity without their name; the activity log
 * gets one line that a member left, with no name in it.
 */
export async function deleteAccountAction(_prev: DeleteAccountFormState, formData: FormData): Promise<DeleteAccountFormState> {
  const session = await requireSession();
  if (session.workspace.slug === DEMO_WORKSPACE_SLUG) return { formError: "The public demo is view only." };

  const auth = getAuthStore();
  const result = await deleteOwnAccount(
    { userId: session.user.id, password: String(formData.get("password") ?? "") },
    {
      userRepository: auth.users,
      membershipRepository: auth.memberships,
      accountRepository: auth.accounts,
      rateLimiter: deleteLimiter(),
      beforeDelete: () =>
        recordAudit({ workspaceId: session.workspace.id, actorId: null, action: "account.deleted", targetType: "user", targetId: "deleted" }),
    },
  );
  if (!result.ok) {
    const messages = {
      OWNER: "As the owner, delete the workspace instead (below), or ask for ownership to be moved first.",
      WRONG_PASSWORD: "That isn't your password.",
      RATE_LIMITED: "Too many wrong attempts. Try again in a few minutes.",
      NO_SUCH_USER: "Your account couldn't be found.",
    } as const;
    return { formError: messages[result.error] };
  }

  await clearSessionCookie();
  redirect("/login?accountDeleted=1");
}
