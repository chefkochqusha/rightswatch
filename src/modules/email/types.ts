export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. The messages Bekvor sends are short and carry one link. */
  text: string;
}

export interface EmailSender {
  /** `OUTBOX`: nothing leaves the server, messages are kept in memory for
   *  development. `RESEND`: sent through Resend. `SMTP`: any mail server. */
  readonly mode: "OUTBOX" | "RESEND" | "SMTP";
  send(message: EmailMessage): Promise<void>;
}
