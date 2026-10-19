/**
 * Sends the one waitlist invitation (`RELEASE_CHECKLIST.md`, "Waitlist").
 * A dry run by default: it lists who would get the email and changes nothing.
 *
 *   set -a && . ./.env.production.local && set +a
 *   npx tsx scripts/waitlist/send-invites.mts --start 2026-11-02            # dry run
 *   npx tsx scripts/waitlist/send-invites.mts --start 2026-11-02 --send     # sends
 *
 * Needs DATABASE_URL, APP_URL and a real email provider (SMTP_* or RESEND_API_KEY,
 * with EMAIL_FROM a mailbox someone reads: replies are how people may withdraw).
 * `--limit N` sends at most N (try `--limit 1` to yourself first); one email per
 * second. Each address gets the invitation once; run it again after a failure.
 */
import { WAITLIST_INVITE_TEMPLATE, emailSenderFromEnv, waitlistInviteEmail } from "../../src/modules/email";
import { inviteWaitlist } from "../../src/modules/waitlist";
import { PrismaWaitlistRepository } from "../../src/modules/waitlist/prisma-repository";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const start = arg("--start");
const send = process.argv.includes("--send");
const limit = arg("--limit") ? Number(arg("--limit")) : undefined;
if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start) || Number.isNaN(Date.parse(`${start}T00:00:00Z`))) {
  throw new Error("Give the date access starts: --start YYYY-MM-DD");
}
if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) throw new Error("--limit must be a positive whole number");
const startDate = new Date(`${start}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const baseUrl = process.env.APP_URL?.replace(/\/+$/, "");
if (!baseUrl) throw new Error("Set APP_URL (the live address, e.g. https://bekvor.com): the links in the email point there.");
const sender = emailSenderFromEnv(process.env);
if (send && sender.mode === "OUTBOX") throw new Error("No email provider is configured (SMTP_* or RESEND_API_KEY with EMAIL_FROM): nothing would be sent.");
if (send && process.env.WAITLIST_MODE === "on" && Date.parse(`${start}T00:00:00Z`) <= Date.now()) {
  console.warn("Warning: WAITLIST_MODE is still on in this environment, so sign-up is closed. Turn it off in Vercel and redeploy before access starts.");
}

const report = await inviteWaitlist(
  { dryRun: !send, limit },
  {
    repository: new PrismaWaitlistRepository(),
    linkFor: (kind, token) => `${baseUrl}/waitlist/${kind}?token=${encodeURIComponent(token)}`,
    sendInvitation: async (to, links) => {
      await sender.send(waitlistInviteEmail({ to, startDate, signupLink: `${baseUrl}/signup`, leaveLink: links.leave, imprintLink: `${baseUrl}/imprint` }));
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { template: WAITLIST_INVITE_TEMPLATE };
    },
  },
);

const line = (label: string, list: string[]) => console.log(`${label}: ${list.length}${list.length ? `\n  ${list.join("\n  ")}` : ""}`);
console.log(send ? `Invitations for access from ${startDate}:` : `Dry run (nothing sent; add --send), access from ${startDate}:`);
line(send ? "Sent" : "Would send", send ? report.invited : report.wouldInvite);
line("Not sent, confirmed more than two years ago (consent may have lapsed)", report.stale);
if (report.failed.length) line("Failed, will be retried by the next run", report.failed.map((f) => `${f.email}: ${f.error}`));
process.exit(report.failed.length ? 1 : 0);
