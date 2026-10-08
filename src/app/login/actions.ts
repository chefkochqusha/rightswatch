"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { logIn } from "@/modules/auth";
import { recordAudit } from "@/app/_lib/audit-event";
import { getAuthStore } from "@/app/_lib/auth-store";
import { setSessionCookie } from "@/app/_lib/session-cookie";

export interface LogInFormState {
  formError?: string;
}

export async function logInAction(
  _prevState: LogInFormState,
  formData: FormData,
): Promise<LogInFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  // Vercel sets `x-forwarded-for` itself and drops any value a client sent
  // (Vercel docs, "Request headers"), so its first entry is the real client
  // address there. Locally there's no such header and the per-IP limiter
  // simply doesn't apply.
  const clientIp = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  const store = getAuthStore();
  const result = await logIn(
    { email, password, clientIp },
    {
      userRepository: store.users,
      rateLimiter: store.loginRateLimiter,
      ipRateLimiter: store.loginIpRateLimiter,
    },
  );

  if (!result.ok) {
    // A wrong password for a real account goes into that account's workspace log
    // (no address, no password); unknown emails leave no trace anywhere.
    if (result.error === "INVALID_CREDENTIALS") {
      const user = await store.users.findByEmail(email.trim().toLowerCase());
      if (user) await logToWorkspaces(user.id, user.id, "account.login_failed");
    }
    if (result.error === "RATE_LIMITED") {
      const minutes = Math.ceil(result.retryAfterMs / 60_000);
      return {
        formError: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      };
    }
    return { formError: "Incorrect email or password." };
  }

  await setSessionCookie(result.user.id);
  await logToWorkspaces(result.user.id, result.user.id, "account.logged_in");
  redirect("/workspace");
}

async function logToWorkspaces(userId: string, actorId: string | null, action: string): Promise<void> {
  const memberships = await getAuthStore().memberships.findForUser(userId);
  for (const m of memberships) {
    await recordAudit({ workspaceId: m.workspaceId, actorId, action, targetType: "user", targetId: userId });
  }
}
