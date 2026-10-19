export type { EmailMessage, EmailSender } from "./types";
export { OutboxEmailSender } from "./outbox";
export { ResendEmailSender } from "./resend";
export { SmtpEmailSender, smtpSettingsFromEnv } from "./smtp";
export { emailSenderFromEnv } from "./from-env";
export type { SmtpSettings } from "./smtp";
export { WAITLIST_CONFIRM_TEMPLATE, WAITLIST_INVITE_TEMPLATE, accountExistsEmail, inviteEmail, newCasesEmail, waitlistConfirmEmail, waitlistInviteEmail } from "./templates";
export type { NewCaseLine } from "./templates";
