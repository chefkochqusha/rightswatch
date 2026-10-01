export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. The messages RightsWatch sends are short and carry one link. */
  text: string;
}

export interface EmailSender {
  /** `OUTBOX`: nothing leaves the server, messages are kept in memory for
   *  development. `RESEND`: sent through Resend. */
  readonly mode: "OUTBOX" | "RESEND";
  send(message: EmailMessage): Promise<void>;
}
