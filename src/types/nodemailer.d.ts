/**
 * The part of nodemailer (MIT-0, ships no types) that `modules/email/smtp.ts`
 * uses: an SMTP transport and `sendMail`.
 */
declare module "nodemailer" {
  export interface SmtpOptions {
    host: string;
    port: number;
    secure: boolean;
    requireTLS?: boolean;
    auth?: { user: string; pass: string };
    connectionTimeout?: number;
    greetingTimeout?: number;
    socketTimeout?: number;
  }
  export interface Transporter {
    sendMail(message: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
    verify(): Promise<true>;
  }
  export function createTransport(options: SmtpOptions): Transporter;
  const nodemailer: { createTransport: typeof createTransport };
  export default nodemailer;
}
