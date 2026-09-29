"use server";

import { redirect } from "next/navigation";
import { logIn } from "@/modules/auth";
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

  const store = getAuthStore();
  const result = await logIn(
    { email, password },
    { userRepository: store.users, rateLimiter: store.loginRateLimiter },
  );

  if (!result.ok) {
    if (result.error === "RATE_LIMITED") {
      const minutes = Math.ceil(result.retryAfterMs / 60_000);
      return {
        formError: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      };
    }
    return { formError: "Incorrect email or password." };
  }

  await setSessionCookie(result.user.id);
  redirect("/workspace");
}
