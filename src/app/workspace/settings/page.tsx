import { getBillingStore } from "@/app/_lib/billing-store";
import { dataModeFor } from "@/app/_lib/connector-mode";
import { DEMO_WORKSPACE_SLUG } from "@/app/_lib/demo-access";
import { requireSession } from "@/app/_lib/current-user";
import { getEmailSender } from "@/app/_lib/email";
import { getRecognitionMode } from "@/app/_lib/recognition";
import { getMusicSearchMode } from "@/app/_lib/song-search";
import { PageHeader } from "@/components/ui/page-header";
import { ROLE_LABELS } from "@/components/team/labels";
import { DeleteWorkspaceForm } from "./delete-workspace-form";
import { PasswordForm } from "./password-form";

export const metadata = {
  title: "Settings — RightsWatch",
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
      ...(isRealData
        ? getRecognitionMode() === "AUDD"
          ? {
              state: "AudD",
              tone: "ok" as const,
              detail: "Songs in real posts are identified with AudD. AudD reports a match but no confidence score, so the percentage shown for its matches is a fixed value, not a measurement.",
            }
          : {
              state: "Not connected",
              tone: "off" as const,
              detail: "TikTok's commercial data carries no music information, so identifying songs in posts needs audio recognition, which isn't connected yet. Until then posts are listed as having no song identified.",
            }
        : {
            state: "Demo",
            tone: "demo" as const,
            detail: "Matches in demo data are made up. Identifying songs in real posts needs audio recognition, which isn't connected yet.",
          }),
    },
    {
      name: "Email",
      what: "Password reset emails",
      ...(email.mode === "RESEND"
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
