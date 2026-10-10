import Link from "next/link";
import type { ReactNode } from "react";
import { legalDetailsFromEnv } from "@/app/_lib/legal-details";

export const metadata = { title: "Privacy — Bekvor", robots: { index: false } };

const H2 = "mt-10 text-[1.0625rem] font-semibold tracking-[-0.01em] text-tx";
const A = "text-accent underline underline-offset-2 hover:decoration-2";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className={H2}>{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/**
 * Privacy policy (GDPR Art. 13), the English version of `legal/datenschutzerklaerung.md`
 * and, like it, a draft until a lawyer has reviewed it. Written from `DATA_FLOWS.md`:
 * when a feature sends data somewhere new, change both. The hosting paragraph
 * follows where this copy actually runs (Vercel or our own server).
 */
export default function Page() {
  const d = legalDetailsFromEnv();
  const onVercel = process.env.VERCEL === "1";
  const hostingProvider = process.env.PRIVACY_HOSTING_PROVIDER?.trim() || null;
  const emailProvider = process.env.PRIVACY_EMAIL_PROVIDER?.trim() || null;
  const privacyMail = d ? <a className={A} href={`mailto:${d.privacyEmail}`}>{d.privacyEmail}</a> : "the address in the imprint";

  return (
    <div className="mx-auto max-w-2xl px-5 pt-32 pb-24 leading-relaxed text-t2 sm:px-8">
      <h1 className="font-display text-[2.5rem] leading-none font-extrabold tracking-[-0.03em] text-tx">Privacy</h1>
      <p className="mt-4 text-[0.875rem]">Draft, published before launch. The final text is reviewed by a lawyer.</p>

      <Section title="1. Who is responsible">
        {d ? (
          <p>
            <span className="text-tx">{d.name}</span>, {d.address.join(", ")}. Email: {privacyMail}, phone: {d.phone}. More in the{" "}
            <Link className={A} href="/imprint">imprint</Link>.
          </p>
        ) : (
          <p>The operator&apos;s details follow in the <Link className={A} href="/imprint">imprint</Link> before Bekvor opens for customers.</p>
        )}
        <p>We have not appointed a data protection officer because the law doesn&apos;t require one for us (Art. 37 GDPR, § 38 BDSG).</p>
      </Section>

      <Section title="2. What this policy covers">
        <p>
          The data we decide about ourselves: visits to this website, your account, billing, service emails and the partner programme.
        </p>
        <p>
          What customers keep in their workspace (the creators they watch, those creators&apos; posts, uploaded recordings and videos, cases and
          notes) we process <strong className="text-tx">on the customer&apos;s behalf</strong> (Art. 28 GDPR); the customer is responsible for it. If
          you are a creator with a question about this, please contact the company that monitors your posts. Requests that reach us, we forward to
          that customer.
        </p>
      </Section>

      <Section title="3. Visiting the website">
        <p>
          Our servers record your IP address, the time, the address requested, your browser&apos;s user agent, the referrer, the amount of data and
          the status code, to deliver the site, find errors and fend off attacks (Art. 6(1)(f) GDPR, our legitimate interest in a working, secure
          service). These logs are kept for a short time and then deleted.
        </p>
        <p>
          We use <strong className="text-tx">no analytics, tracking or advertising tools</strong>, no social media plugins, and load no fonts or
          scripts from other servers.
        </p>
      </Section>

      <Section title="4. Cookies">
        <p>
          We set one cookie: the <strong className="text-tx">session cookie</strong> when you log in or open the demo. It holds a random id that
          keeps you logged in for at most 7 days. It is strictly necessary for the service you ask for (§ 25(2) no. 2 TDDDG), so no consent is
          needed. A partner code from a referral link travels only in the address and the signup form, never in a cookie or browser storage.
        </p>
      </Section>

      <Section title="5. Your account">
        <p>
          Email address, name (optional), password (stored only as a scrypt hash), your role, the workspace name, your confirmation that you sign up
          for a business and are of age, login times and sessions, and entries in the workspace&apos;s activity log. We need them to run your
          account and the team&apos;s permissions (Art. 6(1)(b) GDPR); the activity log and the limits on login and sign-up attempts serve traceability and
          abuse prevention (Art. 6(1)(f)). For those limits we keep only a one-way code of your email and IP address, removed after a day
          without attempts.
        </p>
        <p>
          We keep them until you delete your account or the workspace is deleted. Backups are overwritten within days after that. Notes and log
          entries stay with the workspace without your name. If a colleague invites you, we get your email address from them.
        </p>
      </Section>

      <Section title="6. Service emails">
        <p>
          We only send emails that are part of the service: confirming your address, resetting your password, telling you that you already have an
          account, invites a teammate sends, and alerts about new cases (which you can turn off in Settings). No advertising, no newsletters, no open
          or click tracking (Art. 6(1)(b) GDPR; invites Art. 6(1)(f)).{" "}
          {emailProvider ? `They are sent through ${emailProvider}, which processes them on our behalf.` : "They are sent through an email provider that processes them on our behalf."}
        </p>
      </Section>

      <Section title="7. Billing">
        <p>
          Company name, billing address, VAT ID, email, plan, payment status and invoices, to bill the contract, meet tax duties and check that you
          are a business (Art. 6(1)(b) and (c) GDPR). Card details go straight to our payment provider, Stripe Payments Europe, Ltd. (Dublin,
          Ireland); we never see them. Stripe may pass data to Stripe, Inc. in the US, which is certified under the EU-US Data Privacy Framework.
          Invoices and accounting records are kept for 8 years, other business letters for 6 (§ 147 AO, § 257 HGB).
        </p>
      </Section>

      <Section title="8. Partner programme">
        <p>
          Your partner code, which workspaces signed up through it, commissions (amount, invoice, payout date) and your payout and tax details
          (Art. 6(1)(b) and (c) GDPR), kept like billing records.
        </p>
      </Section>

      <Section title="9. Emailing us">
        <p>
          We use your message and details to answer (Art. 6(1)(b) GDPR where it concerns a contract, otherwise (f)) and delete them once the matter
          is settled and no retention duty applies. Reports under the Digital Services Act are kept while they are handled and for proof afterwards
          (Art. 6(1)(c)).
        </p>
      </Section>

      <Section title="10. Song search">
        <p>
          When you search for a song in the Rights Library, <strong className="text-tx">our server</strong> sends the search text to MusicBrainz
          (MetaBrainz Foundation, US) and loads cover art from the Cover Art Archive (Internet Archive, US). Your IP address and account are not
          sent. Please don&apos;t type personal data into the search.
        </p>
      </Section>

      <Section title="11. Hosting">
        {onVercel ? (
          <p>
            The website and the app are served by Vercel Inc. (Covina, California, US), and the database is run by Neon, Inc. (US). Both process
            data on our behalf under a data processing agreement. Transfers to the US rely on the EU-US Data Privacy Framework adequacy decision
            (Art. 45 GDPR), which is under challenge before the Court of Justice of the EU.
          </p>
        ) : (
          <p>
            The website, the app, the database and uploads run on our own server
            {hostingProvider ? ` at ${hostingProvider}` : " in a data centre in the EU"}, which processes data on our behalf under a data processing
            agreement.
          </p>
        )}
      </Section>

      <Section title="12. No automated decisions">
        <p>
          Bekvor recognises songs in posts and compares them with a customer&apos;s rights records. The result is a signal for a person to review,
          not a decision with legal effect on you (Art. 22 GDPR). We use no AI language models.
        </p>
      </Section>

      <Section title="13. Your rights">
        <p>
          You have the right of access (Art. 15 GDPR), rectification (16), erasure (17), restriction (18) and data portability (20), and{" "}
          <strong className="text-tx">the right to object to processing based on legitimate interests (Art. 21)</strong>. In Settings you can
          download your data and delete your account yourself; otherwise write to {privacyMail}.
        </p>
        <p>
          You can complain to a data protection supervisory authority (Art. 77 GDPR)
          {d?.supervisoryAuthority ? `, for example the one responsible for us: ${d.supervisoryAuthority}` : ""}.
        </p>
      </Section>

      <Section title="14. Do you have to give us data?">
        <p>
          An account needs an email address and a password, a paid plan needs billing details; without them we can&apos;t enter into the contract.
          Everything else is optional.
        </p>
      </Section>
    </div>
  );
}

// The footer's "Try the demo" Server Action fills the demo workspace on the first visit,
// which takes longer than the default limit.
export const maxDuration = 120;
