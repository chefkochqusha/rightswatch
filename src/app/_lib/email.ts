import { headers } from "next/headers";
import { OutboxEmailSender, ResendEmailSender, SmtpEmailSender, smtpSettingsFromEnv } from "@/modules/email";
import type { EmailSender } from "@/modules/email";

/**
 * The email sender: any SMTP server when `SMTP_HOST` and `EMAIL_FROM` are
 * set (our own server's choice: any mail provider, no single vendor), else
 * Resend when `RESEND_API_KEY` and `EMAIL_FROM` are set, else the in-memory
 * outbox (nothing is sent).
 */
const globalForEmail = globalThis as unknown as { __rightswatchEmail?: EmailSender };

export function getEmailSender(): EmailSender {
  if (!globalForEmail.__rightswatchEmail) {
    const smtp = smtpSettingsFromEnv(process.env);
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    globalForEmail.__rightswatchEmail = smtp
      ? new SmtpEmailSender(smtp)
      : apiKey && from
        ? new ResendEmailSender({ apiKey, from })
        : new OutboxEmailSender();
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
