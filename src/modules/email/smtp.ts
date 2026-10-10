import type { EmailMessage, EmailSender } from "./types";

/**
 * Sends through any SMTP server — the mail service of the hosting company,
 * an EU provider, or the owner's own — so email doesn't depend on one
 * vendor. Port 465 uses TLS from the start; any other port (587) must
 * upgrade with STARTTLS (`requireTLS`), so passwords and messages never go
 * over the network unencrypted.
 */
export interface SmtpSettings {
  host: string;
  port: number;
  user: string | null;
  password: string | null;
  from: string;
}

type Transport = { sendMail(message: { from: string; to: string; subject: string; text: string }): Promise<unknown> };

export class SmtpEmailSender implements EmailSender {
  readonly mode = "SMTP" as const;
  private transport: Promise<Transport> | null = null;

  constructor(
    private readonly settings: SmtpSettings,
    /** For tests; defaults to nodemailer's SMTP transport. */
    private readonly makeTransport?: (settings: SmtpSettings) => Transport,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const transport = await (this.transport ??= this.createTransport());
    try {
      await transport.sendMail({ from: this.settings.from, to: message.to, subject: message.subject, text: message.text });
    } catch (error) {
      // The server's answer can say why (bad login, unknown recipient); it never holds our password.
      throw new Error(`The mail server refused the email: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`);
    }
  }

  private async createTransport(): Promise<Transport> {
    if (this.makeTransport) return this.makeTransport(this.settings);
    const { createTransport } = await import("nodemailer");
    const { host, port, user, password } = this.settings;
    return createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      ...(user && password ? { auth: { user, pass: password } } : {}),
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
  }
}

/** SMTP settings from the environment, or null when they aren't complete. */
export function smtpSettingsFromEnv(env: Record<string, string | undefined>): SmtpSettings | null {
  const host = env.SMTP_HOST?.trim();
  const from = env.EMAIL_FROM?.trim();
  const port = Number(env.SMTP_PORT ?? 587);
  if (!host || !from || !Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return { host, port, user: env.SMTP_USER?.trim() || null, password: env.SMTP_PASSWORD || null, from };
}
