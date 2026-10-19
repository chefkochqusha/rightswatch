import { OutboxEmailSender } from "./outbox";
import { ResendEmailSender } from "./resend";
import { SmtpEmailSender, smtpSettingsFromEnv } from "./smtp";
import type { EmailSender } from "./types";

/**
 * The email sender the configuration asks for: any SMTP server when
 * `SMTP_HOST` and `EMAIL_FROM` are set (our own server's choice: any mail
 * provider, no single vendor), else Resend when `RESEND_API_KEY` and
 * `EMAIL_FROM` are set, else the in-memory outbox (nothing is sent).
 */
export function emailSenderFromEnv(env: Record<string, string | undefined>): EmailSender {
  const smtp = smtpSettingsFromEnv(env);
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (smtp) return new SmtpEmailSender(smtp);
  if (apiKey && from) return new ResendEmailSender({ apiKey, from });
  return new OutboxEmailSender();
}
