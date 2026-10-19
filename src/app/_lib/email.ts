import { headers } from "next/headers";
import { emailSenderFromEnv } from "@/modules/email";
import type { EmailSender } from "@/modules/email";

/** The email sender (`emailSenderFromEnv`: SMTP, else Resend, else the in-memory outbox). */
const globalForEmail = globalThis as unknown as { __rightswatchEmail?: EmailSender };

export function getEmailSender(): EmailSender {
  return (globalForEmail.__rightswatchEmail ??= emailSenderFromEnv(process.env));
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
