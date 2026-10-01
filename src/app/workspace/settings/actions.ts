"use server";

import { revalidatePath } from "next/cache";
import { changePassword, MIN_PASSWORD_LENGTH } from "@/modules/auth";
import { getAuthStore } from "@/app/_lib/auth-store";
import { DEMO_WORKSPACE_SLUG } from "@/app/_lib/demo-access";
import { requireSession } from "@/app/_lib/current-user";
import { setSessionCookie } from "@/app/_lib/session-cookie";

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

  // Every session ended, this browser's included: start a fresh one.
  await setSessionCookie(session.user.id);
  revalidatePath("/workspace/settings");
  return { done: true };
}
