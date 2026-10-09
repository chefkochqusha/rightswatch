"use server";

import { redirect } from "next/navigation";
import { acceptInvite } from "@/modules/auth";
import { getAuthStore } from "@/app/_lib/auth-store";
import { getSessionSecret, setSessionCookie } from "@/app/_lib/session-cookie";

export interface AcceptInviteFormState {
  fieldErrors?: Partial<Record<"password", string>>;
  formError?: string;
}

/**
 * Thin Server Action adapter over `acceptInvite()`, mirroring
 * `signup/actions.ts`'s `signUpAction` (same session-cookie-then-redirect
 * on success) — the two differ only in which domain function they call,
 * since `acceptInvite` shares `signUp`'s account-creation core but joins an
 * existing workspace instead of creating a new one.
 *
 * The token is the only source of truth for which workspace/role this is —
 * it comes from a hidden form field, but `acceptInvite` re-verifies its
 * signature and expiry itself rather than trusting that field, so a
 * tampered token is rejected here exactly as it would be anywhere else.
 */
export async function acceptInviteAction(
  _prevState: AcceptInviteFormState,
  formData: FormData,
): Promise<AcceptInviteFormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");

  const store = getAuthStore();
  const result = await acceptInvite(
    { token, password, name: name || null },
    {
      userRepository: store.users,
      accountRepository: store.accounts,
      secret: getSessionSecret(),
    },
  );

  if (!result.ok) {
    if (result.error === "WEAK_PASSWORD") {
      return { fieldErrors: { password: "Password must be at least 8 characters." } };
    }
    if (result.error === "EMAIL_ALREADY_REGISTERED") {
      // Covers both an invite that was already accepted and an email that
      // had an account before it was invited — see `acceptInvite`'s comment.
      return {
        formError:
          "This email already has a Bekvor account — log in with it. An existing account can't join a second workspace yet; ask for an invite to a different email.",
      };
    }
    return {
      formError: "This invite link isn't valid anymore — ask whoever invited you to send a new one.",
    };
  }

  await setSessionCookie(result.user.id);
  redirect("/workspace");
}
