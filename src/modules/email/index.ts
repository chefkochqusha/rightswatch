export type { EmailMessage, EmailSender } from "./types";
export { OutboxEmailSender } from "./outbox";
export { ResendEmailSender } from "./resend";
export { SmtpEmailSender, smtpSettingsFromEnv } from "./smtp";
export type { SmtpSettings } from "./smtp";
export { WAITLIST_CONFIRM_TEMPLATE, accountExistsEmail, inviteEmail, newCasesEmail, waitlistConfirmEmail } from "./templates";
export type { NewCaseLine } from "./templates";
