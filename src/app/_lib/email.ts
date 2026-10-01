import { headers } from "next/headers";
import { OutboxEmailSender, ResendEmailSender } from "@/modules/email";
import type { EmailSender } from "@/modules/email";

/**
 * The email sender: Resend when `RESEND_API_KEY` and `EMAIL_FROM` are both
 * set, the in-memory outbox otherwise (nothing is sent). Same all-or-nothing
 * rule as the Stripe variables.
 */
const globalForEmail = globalThis as unknown as { __rightswatchEmail?: EmailSender };

export function getEmailSender(): EmailSender {
  if (!globalForEmail.__rightswatchEmail) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    globalForEmail.__rightswatchEmail = apiKey && from ? new ResendEmailSender({ apiKey, from }) : new OutboxEmailSender();
  }
  return globalForEmail.__rightswatchEmail;
}

/**
 * The origin links in emails point to. In production it comes from
 * configuration, never from the request: a forged `Host` header on a
 * "forgot password" request would otherwise put an attacker's domain in the
 * victim's email. Only in development is the request's own host used.
 */
export async function getAppBaseUrl(): Promise<string | null> {
  const configured = process.env.APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.NODE_ENV === "production") return null;
  const host = (await headers()).get("host");
  return host ? `http://${host}` : null;
}
