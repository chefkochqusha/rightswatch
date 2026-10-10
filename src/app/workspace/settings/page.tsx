import { getBillingStore } from "@/app/_lib/billing-store";
import { dataModeFor } from "@/app/_lib/connector-mode";
import { DEMO_WORKSPACE_SLUG } from "@/app/_lib/demo-access";
import { requireSession } from "@/app/_lib/current-user";
import { getEmailSender } from "@/app/_lib/email";
import { isOwnRecognitionEnabled } from "@/app/_lib/own-recognition";
import { emailAlertsEnabled } from "@/app/_lib/case-alerts";
import { getMusicSearchMode } from "@/app/_lib/song-search";
import { canManageWorkspace } from "@/app/_lib/authorize";
import { buttonStyles } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ROLE_LABELS } from "@/components/team/labels";
import { getReferralStore } from "@/app/_lib/referral-store";
import { siteOrigin } from "@/app/_lib/site-origin";
import { formatPlanPrice } from "@/components/billing/labels";
import { PARTNER_PROGRAMME, summarizeCommissions } from "@/modules/referrals";
import { JoinPartnerForm, PartnerLink } from "./partner-section";
import { DeleteAccountForm } from "./delete-account-form";
import { DeleteWorkspaceForm } from "./delete-workspace-form";
import { PasswordForm } from "./password-form";
import { setEmailAlertsAction } from "./actions";

export const metadata = {
  title: "Settings — Bekvor",
};

type Tone = "ok" | "demo" | "off";

interface Connection {
  name: string;
  what: string;
  state: string;
  tone: Tone;
  detail: string;
}

const TONES: Record<Tone, string> = {
  ok: "bg-cleared-bg text-cleared",
  demo: "bg-review-bg text-review",
  off: "bg-unknown-bg text-unknown",
};

/**
 * Settings (Brief §63): what the workspace is connected to, and the
 * signed-in person's own account. The connection list is a status board —
 * it reads which providers the server runs with and shows nothing secret.
 */
export default async function SettingsPage() {
  const session = await requireSession();
  const isDemo = session.workspace.slug === DEMO_WORKSPACE_SLUG;

  const email = getEmailSender();
  const music = getMusicSearchMode();
  const payments = getBillingStore().mode;

  const isRealData = dataModeFor(session.workspace) === "REAL";
  const emailAlerts = await emailAlertsEnabled(session.user.id);

  // Partner programme: link, referrals and commissions of the signed-in person.
  const referralStore = getReferralStore().referrals;
  const partner = isDemo ? null : await referralStore.findPartnerByUser(session.user.id);
  const partnerReferrals = partner ? await referralStore.findReferralsForPartner(partner.id) : [];
  const partnerMoney = partner ? summarizeCommissions(await referralStore.findCommissionsForPartner(partner.id)) : null;
  const connections: Connection[] = [
    {
      name: "TikTok",
      what: "Where paid and commercial posts come from",
      ...(isRealData
        ? { state: "Connected", tone: "ok" as const, detail: "Scans read TikTok's Commercial Content data." }
        : {
            state: "Demo data",
            tone: "demo" as const,
            detail: "TikTok API access isn't connected yet, so scans run against fictional posts. Nothing in demo data is a real TikTok video.",
          }),
    },
    {
      name: "Song search",
      what: "Finds songs when you add them to the Rights Library",
      ...(music === "musicbrainz"
        ? { state: "MusicBrainz", tone: "ok" as const, detail: "The open music database. It provides titles, artists and ISRC codes." }
        : { state: "Demo catalogue", tone: "demo" as const, detail: "A small fictional catalogue, used for tests and offline work." }),
    },
    {
      name: "Music in posts",
      what: "Identifies which song a post uses",
      ...(isOwnRecognitionEnabled() && !isDemo
        ? {
            state: "Bekvor recognition",
            tone: "ok" as const,
            detail: "Bekvor's own recognition, on its own server. Add reference audio to your songs, then upload a post's video or sound and Bekvor finds which of your songs it uses. Post audio isn't fetched from TikTok automatically.",
          }
        : isRealData
          ? {
              state: "Not on this server",
              tone: "off" as const,
              detail: "TikTok's commercial data carries no music information. Bekvor's own recognition runs on its own server; until it's set up here, choose the song in each post yourself.",
            }
        : {
            state: "Demo",
            tone: "demo" as const,
            detail: "Matches in demo data are made up. For real posts, Bekvor recognises songs from the post's video or sound with its own recognition.",
          }),
    },
    {
      name: "Email",
      what: "Password reset emails",
      ...(email.mode !== "OUTBOX"
        ? { state: "Sending", tone: "ok" as const, detail: "Emails go out through the configured sender address." }
        : { state: "Not set up", tone: "off" as const, detail: "Nothing is sent yet. Invite links are shared by hand and password reset by email isn't available." }),
    },
    {
      name: "Payments",
      what: "Plans and billing",
      ...(payments === "stripe"
        ? { state: "Stripe test mode", tone: "demo" as const, detail: "Checkout runs against Stripe's test environment. No real charges." }
        : { state: "Test plans", tone: "demo" as const, detail: "Plans are simulated. No payment provider is connected and nobody is charged." }),
    },
  ];

  return (
    <div className="space-y-10">
      <PageHeader title="Settings" description={`Connections for ${session.workspace.name}, and your own account.`} />

      <section aria-labelledby="connections-heading">
        <h2 id="connections-heading" className="text-sm font-semibold">
          Connections
        </h2>
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {connections.map((c) => (
            <li key={c.name} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-5 py-4">
              <div className="min-w-0 max-w-xl">
                <p className="text-sm font-medium text-tx">{c.name}</p>
                <p className="text-[0.8125rem] text-t2">{c.what}</p>
                <p className="mt-2 text-[0.8125rem] leading-normal text-t2">{c.detail}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${TONES[c.tone]}`}>{c.state}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="account-heading">
        <h2 id="account-heading" className="text-sm font-semibold">
          Your account
        </h2>
        <dl className="mt-3 grid max-w-xl grid-cols-[8rem_1fr] gap-y-2 text-[0.8125rem]">
          <dt className="text-t2">Name</dt>
          <dd className="text-tx">{session.user.name ?? "—"}</dd>
          <dt className="text-t2">Email</dt>
          <dd className="text-tx">{isDemo ? "Hidden in the demo" : session.user.email}</dd>
          <dt className="text-t2">Role</dt>
          <dd className="text-tx">{ROLE_LABELS[session.role]}</dd>
        </dl>

        {!isDemo && session.role !== "VIEWER" && (
          <div id="email-alerts" className="mt-6 scroll-mt-8 rounded-lg border border-line bg-surface p-5">
            <h3 className="text-sm font-semibold">Email about new cases</h3>
            <p className="mt-1 text-[0.8125rem] text-t2">
              {email.mode === "OUTBOX"
                ? "This server doesn't send email yet. Once it does, you get one email when a scan or a check opens new cases."
                : "One email when a scan or a check opens new cases, with a link to each. Notifications in the app come either way."}
            </p>
            <form action={setEmailAlertsAction} className="mt-3 flex items-center gap-3">
              <input id="email-alerts-enabled" name="enabled" type="checkbox" defaultChecked={emailAlerts} className="h-4 w-4 accent-accent" />
              <label htmlFor="email-alerts-enabled" className="text-sm">Email me when new cases open</label>
              <button type="submit" className={buttonStyles("secondary", "sm")}>Save</button>
            </form>
          </div>
        )}

        <div className="mt-6 rounded-lg border border-line bg-surface p-5">
          <h3 className="text-sm font-semibold">Change password</h3>
          {isDemo ? (
            <p className="mt-2 text-[0.8125rem] text-t2">The public demo is view only. Start your own workspace to set a password.</p>
          ) : (
            <>
              <p className="mt-1 mb-4 text-[0.8125rem] text-t2">You&apos;ll be signed out on every other device.</p>
              <PasswordForm />
            </>
          )}
        </div>

        {!isDemo && (
          <div className="mt-6 rounded-lg border border-line bg-surface p-5">
            <h3 className="text-sm font-semibold">Download your data</h3>
            <p className="mt-1 mb-4 max-w-xl text-[0.8125rem] text-t2">
              A JSON file you can keep or move elsewhere. It never contains password hashes. Each download is written to the activity log.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="/workspace/settings/export?scope=account" download className={buttonStyles("secondary", "sm")}>
                My account data
              </a>
              {canManageWorkspace(session.role) && (
                <a href="/workspace/settings/export?scope=workspace" download className={buttonStyles("secondary", "sm")}>
                  Whole workspace
                </a>
              )}
            </div>
          </div>
        )}

        {!isDemo && (
          <div className="mt-6 rounded-lg border border-line bg-surface p-5">
            <h3 className="text-sm font-semibold">Partner programme</h3>
            <p className="mt-1 mb-4 max-w-xl text-[0.8125rem] text-t2">
              Recommend Bekvor to other labels, publishers or agencies. For every business that signs up through your link you earn{" "}
              {PARTNER_PROGRAMME.commissionPercent} % of what it pays in its first {PARTNER_PROGRAMME.commissionMonths} months.
            </p>
            {partner && partnerMoney ? (
              <div className="space-y-4">
                <PartnerLink link={`${siteOrigin()}/signup?ref=${partner.code}`} />
                <dl className="grid max-w-md grid-cols-[1fr_auto] gap-y-1.5 text-[0.8125rem]">
                  <dt className="text-t2">Businesses signed up</dt>
                  <dd className="text-right text-tx">{partnerReferrals.length}</dd>
                  <dt className="text-t2">Earned</dt>
                  <dd className="text-right text-tx">{formatPlanPrice(partnerMoney.earnedCents)}</dd>
                  <dt className="text-t2">Paid out</dt>
                  <dd className="text-right text-tx">{formatPlanPrice(partnerMoney.paidOutCents)}</dd>
                  <dt className="text-t2">Open</dt>
                  <dd className="text-right text-tx">{formatPlanPrice(partnerMoney.openCents)}</dd>
                </dl>
                <p className="text-[0.8125rem] text-t2">Label the link as advertising wherever you share it. Payouts are monthly from €50.</p>
              </div>
            ) : (
              <JoinPartnerForm />
            )}
          </div>
        )}

        {!isDemo && session.role !== "OWNER" && (
          <div className="mt-6 rounded-lg border border-mismatch/40 bg-surface p-5">
            <h3 className="text-sm font-semibold">Delete my account</h3>
            <p className="mt-1 mb-4 max-w-xl text-[0.8125rem] text-t2">
              Deletes your account and your access to {session.workspace.name} for good. Your case notes and past activity stay with the workspace,
              without your name. This can&apos;t be undone.
            </p>
            <DeleteAccountForm />
          </div>
        )}

        {!isDemo && session.role === "OWNER" && (
          <div className="mt-6 rounded-lg border border-mismatch/40 bg-surface p-5">
            <h3 className="text-sm font-semibold">Delete workspace</h3>
            <p className="mt-1 mb-4 max-w-xl text-[0.8125rem] text-t2">
              Deletes {session.workspace.name} and everything in it for good: creators, posts, matches, your rights library, cases, notes, the audit
              log and every team member&apos;s account. Your subscription ends. This can&apos;t be undone.
            </p>
            <DeleteWorkspaceForm workspaceName={session.workspace.name} />
          </div>
        )}
      </section>
    </div>
  );
}
