import type { EmailMessage, EmailSender } from "./types";

/**
 * Sends through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email):
 * `POST /emails` with a bearer key and `{ from, to, subject, text }`.
 *
 * Not yet run against the live service: that needs an account and a verified
 * sending domain, which wait for launch (RELEASE_CHECKLIST.md). The request
 * shape is covered by a test with a stubbed `fetch`.
 */
export class ResendEmailSender implements EmailSender {
  readonly mode = "RESEND" as const;

  constructor(
    private readonly options: { apiKey: string; from: string; fetchImpl?: typeof fetch },
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.options.from, to: [message.to], subject: message.subject, text: message.text }),
    });
    if (!response.ok) {
      // The body can say why (an unverified domain, a bad key); it never holds our key.
      throw new Error(`Resend refused the email (${response.status}): ${(await response.text()).slice(0, 200)}`);
    }
  }
}
