"use server";

import { redirect } from "next/navigation";
import { signUp } from "@/modules/auth";
import { getAuthStore } from "@/app/_lib/auth-store";
import { sendVerificationLink } from "@/app/_lib/email-verification";
import { setSessionCookie } from "@/app/_lib/session-cookie";
import { getReferralStore } from "@/app/_lib/referral-store";
import { recordReferral } from "@/modules/referrals";
import { accountExistsEmail } from "@/modules/email";
import { getAppBaseUrl, getEmailSender } from "@/app/_lib/email";
import { spendRequest } from "@/app/_lib/request-limit";

export interface SignUpFormState {
  fieldErrors?: Partial<Record<"workspaceName" | "email" | "password" | "confirmBusiness", string>>;
}

/**
 * Thin Server Action adapter (Next.js App Router auth guide's
 * signup-form pattern) over the framework-agnostic `signUp()` in
 * `modules/auth` — this file's only jobs are pulling form fields off
 * `FormData`, translating error codes into field-level messages, and
 * issuing the session cookie + redirect on success. All real validation
 * and persistence happens in `signUp()`, which is unit-tested without
 * Next.js at all (see `modules/auth/sign-up.test.ts`).
 */
export async function signUpAction(
  _prevState: SignUpFormState,
  formData: FormData,
): Promise<SignUpFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");
  const workspaceName = String(formData.get("workspaceName") ?? "");

  // Bekvor is sold to businesses (publishers, labels, agencies), not to consumers or children.
  if (formData.get("confirmBusiness") !== "on") {
    return { fieldErrors: { confirmBusiness: "Please confirm this is for business use and that you are at least 18." } };
  }

  const store = getAuthStore();
  const result = await signUp(
    { email, password, name: name || null, workspaceName },
    {
      userRepository: store.users,
      workspaceRepository: store.workspaces,
      accountRepository: store.accounts,
    },
  );

  // With email, signing up never says whether an address already has an
  // account: both cases end on "check your inbox", and the owner of an
  // existing account gets an email instead (Brief §17). Without email the
  // app can't do that, and says it plainly as before.
  const sender = getEmailSender();
  const baseUrl = await getAppBaseUrl();
  const canEmail = sender.mode !== "OUTBOX" && baseUrl !== null;
  if (canEmail && !result.ok && result.error === "EMAIL_ALREADY_REGISTERED") {
    const to = email.trim().toLowerCase();
    if (spendRequest("account-exists-email", to, { max: 3, windowMs: 3600_000 }) === null) {
      await sender
        .send(accountExistsEmail({ to, loginLink: `${baseUrl}/login`, resetLink: `${baseUrl}/forgot-password` }))
        .catch(() => undefined);
    }
    redirect("/signup/check-email");
  }

  if (!result.ok) {
    const fieldErrors: SignUpFormState["fieldErrors"] = {};
    if (result.error === "INVALID_EMAIL") {
      fieldErrors.email = "Enter a valid email address.";
    } else if (result.error === "EMAIL_ALREADY_REGISTERED") {
      fieldErrors.email = "An account with that email already exists.";
    } else if (result.error === "WEAK_PASSWORD") {
      fieldErrors.password = "Password must be at least 8 characters.";
    } else if (result.error === "MISSING_WORKSPACE_NAME") {
      fieldErrors.workspaceName = "Enter a name for your workspace.";
    }
    return { fieldErrors };
  }

  // Signed up through a partner link: link the new workspace to the partner.
  // Best effort, like the email below: a problem here must not stop the signup.
  await recordReferral(
    { code: formData.get("ref"), workspaceId: result.workspace.id, signupUserId: result.user.id },
    getReferralStore(),
  ).catch(() => undefined);

  if (canEmail) {
    // Confirm the address first; the same page an existing address gets.
    await sendVerificationLink(result.user.id).catch(() => undefined);
    redirect("/signup/check-email");
  }
  await setSessionCookie(result.user.id);
  redirect("/workspace");
}
