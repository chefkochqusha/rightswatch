import type { EmailMessage, EmailSender } from "./types";

const MAX_KEPT = 25;

/**
 * The stand-in used until an email provider is configured: keeps the last
 * messages in memory so a developer can follow a reset link. Nothing is sent.
 * Per server process, so it is for local work only.
 */
export class OutboxEmailSender implements EmailSender {
  readonly mode = "OUTBOX" as const;
  private readonly kept: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.kept.push(message);
    if (this.kept.length > MAX_KEPT) this.kept.shift();
  }

  /** Newest first. */
  messages(): EmailMessage[] {
    return [...this.kept].reverse();
  }
}
