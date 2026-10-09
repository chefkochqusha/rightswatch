import { InMemoryRateLimiter, sendEmailVerification, type RateLimiter } from "@/modules/auth";
import { getAuthStore } from "./auth-store";
import { getAppBaseUrl, getEmailSender } from "./email";
import { getSessionSecret } from "./session-cookie";

const globalForVerify = globalThis as unknown as { __rightswatchVerifyLimiter?: RateLimiter };

/**
 * Emails the confirmation link to a user, if this server can send email at
 * all (a real provider is configured and the app knows its own address).
 * Returns what happened so the caller can tell the person.
 */
export async function sendVerificationLink(userId: string): Promise<"SENT" | "ALREADY_VERIFIED" | "RATE_LIMITED" | "UNAVAILABLE"> {
  const sender = getEmailSender();
  const baseUrl = await getAppBaseUrl();
  if (sender.mode !== "RESEND" || !baseUrl) return "UNAVAILABLE";

  const limiter = (globalForVerify.__rightswatchVerifyLimiter ??= new InMemoryRateLimiter({ maxAttempts: 3 }));
  const store = getAuthStore();
  const result = await sendEmailVerification(userId, {
    userRepository: store.users,
    rateLimiter: limiter,
    secret: getSessionSecret(),
    linkFor: (token) => `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`,
    sendLink: (to, link) =>
      sender.send({
        to,
        subject: "Confirm your email for Bekvor",
        text: `Confirm that this is your email address for Bekvor:\n${link}\n\nThe link works for three days. If you didn't create a Bekvor account, you can ignore this email.`,
      }),
  });
  if (result.ok) return "SENT";
  return result.error === "NO_SUCH_USER" ? "UNAVAILABLE" : result.error;
}
