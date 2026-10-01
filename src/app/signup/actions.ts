"use server";

import { redirect } from "next/navigation";
import { signUp } from "@/modules/auth";
import { getAuthStore } from "@/app/_lib/auth-store";
import { setSessionCookie } from "@/app/_lib/session-cookie";

export interface SignUpFormState {
  fieldErrors?: Partial<Record<"workspaceName" | "email" | "password", string>>;
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

  const store = getAuthStore();
  const result = await signUp(
    { email, password, name: name || null, workspaceName },
    {
      userRepository: store.users,
      workspaceRepository: store.workspaces,
      accountRepository: store.accounts,
    },
  );

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

  await setSessionCookie(result.user.id);
  redirect("/workspace");
}
