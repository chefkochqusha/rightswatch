"use server";

import { requestPasswordReset } from "@/modules/auth";
import { OutboxEmailSender } from "@/modules/email";
import { getAuthStore } from "@/app/_lib/auth-store";
import { getAppBaseUrl, getEmailSender } from "@/app/_lib/email";
import { getSessionSecret } from "@/app/_lib/session-cookie";

export interface ForgotPasswordState {
  /** Set once the request was handled; the page then says "check your email". */
  done?: boolean;
  /** This server can't send email yet (no provider in production). */
  noEmail?: boolean;
  /** Development only: the link the outbox holds, since nothing is sent. */
  devLink?: string;
}

/**
 * The answer never depends on whether the email has an account. The one
 * exception is deliberate and local: with no email provider, in development,
 * the link is shown on the page so the flow can be followed.
 */
export async function forgotPasswordAction(_prev: ForgotPasswordState, formData: FormData): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "");
  const sender = getEmailSender();
  const baseUrl = await getAppBaseUrl();
  const isProduction = process.env.NODE_ENV === "production";

  if (sender.mode === "OUTBOX" && isProduction) return { done: true, noEmail: true };
  if (!baseUrl) return { done: true, noEmail: true };

  const store = getAuthStore();
  await requestPasswordReset(
    { email },
    {
      userRepository: store.users,
      rateLimiter: store.resetRateLimiter,
      secret: getSessionSecret(),
      linkFor: (token) => `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`,
      sendResetLink: (to, link) =>
        sender.send({
          to,
          subject: "Reset your RightsWatch password",
          text: `Someone asked to reset the password for your RightsWatch account.\n\nSet a new password here (the link works for one hour):\n${link}\n\nIf this wasn't you, you can ignore this email. Your password stays as it is.`,
        }),
    },
  );

  if (sender.mode === "OUTBOX" && sender instanceof OutboxEmailSender) {
    const link = sender.messages().find((m) => m.to === email.trim().toLowerCase())?.text.match(/https?:\/\/\S+/)?.[0];
    return { done: true, devLink: link };
  }
  return { done: true };
}
