"use server";

import { redirect } from "next/navigation";
import { resetPassword, MIN_PASSWORD_LENGTH } from "@/modules/auth";
import { getAuthStore } from "@/app/_lib/auth-store";
import { getSessionSecret } from "@/app/_lib/session-cookie";

export interface ResetPasswordFormState {
  formError?: string;
}

export async function resetPasswordAction(_prev: ResetPasswordFormState, formData: FormData): Promise<ResetPasswordFormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password !== confirm) return { formError: "The two passwords don't match." };

  const store = getAuthStore();
  const result = await resetPassword(
    { token, newPassword: password },
    { userRepository: store.users, sessionRepository: store.sessions, secret: getSessionSecret() },
  );
  if (!result.ok) {
    return {
      formError:
        result.error === "WEAK_PASSWORD"
          ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
          : "This link has expired or was already used. Ask for a new one.",
    };
  }
  redirect("/login?reset=1");
}
