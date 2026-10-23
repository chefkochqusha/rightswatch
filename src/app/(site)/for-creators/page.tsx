import Link from "next/link";
import type { ReactNode } from "react";
import { legalDetailsFromEnv } from "@/app/_lib/legal-details";

export const metadata = {
  title: "Information for creators — Bekvor",
  description: "What happens with your posts when a company checks its music licences with Bekvor, and how to use your rights.",
};

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
 * Information for the creators whose posts Bekvor's customers check (GDPR
 * Art. 14): their data isn't collected from them, so the controller — the
 * customer — has to tell them. A customer that can't reach every creator in
 * reasonable effort may make the information public instead (Art. 14(5)(b));
 * this page is that public information, written for all customers at once,
 * and the place a customer can link to. A draft until a lawyer has reviewed
 * it (`LEGAL_DE.md`). Keep it in step with `DATA_FLOWS.md`.
 */
export default function Page() {
  const d = legalDetailsFromEnv();
  const privacyMail = d ? <a className={A} href={`mailto:${d.privacyEmail}`}>{d.privacyEmail}</a> : "the address in the imprint";

  return (
    <div className="mx-auto max-w-2xl px-5 pt-32 pb-24 leading-relaxed text-t2 sm:px-8">
      <h1 className="font-display text-[2.5rem] leading-none font-extrabold tracking-[-0.03em] text-tx">Information for creators</h1>
      <p className="mt-4 text-[0.875rem]">Draft, published before launch. The final text is reviewed by a lawyer.</p>

      <p className="mt-8">
        Music publishers, labels and their agencies use Bekvor to check whether the songs they manage are licensed for the paid posts
        they appear in. If you are a creator and one of them watches your account, this page explains what that means for your data
        and how to use your rights (Art. 14 GDPR).
      </p>

      <Section title="1. Who is responsible">
        <p>
          The company that put your account on its list decides what is checked and why. It is the controller for your data. Bekvor
          does the work on its behalf, as a processor (Art. 28 GDPR), and uses your data for nothing else.
        </p>
        <p>
          Don&apos;t know which company it is? Write to us at {privacyMail}. We pass your request to every customer that watches your
          account and tell you who they are, as far as the law allows.
        </p>
      </Section>

      <Section title="2. Which data, and where it comes from">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Your username and profile link on TikTok or Instagram, and what the customer adds (display name, country, follower count).</li>
          <li>
            Your <strong className="text-tx">paid posts</strong> (paid partnerships, ads, or posts labelled as advertising, such as
            &ldquo;Werbung&rdquo; or &ldquo;#ad&rdquo;): link, date, brand names, the label, and for Instagram the caption and post type.
          </li>
          <li>Which song a post uses and whether the customer&apos;s licence covers it.</li>
          <li>The video or sound of a post, only if the customer uploads it to check the song; it is deleted after the check.</li>
        </ul>
        <p>
          Sources: the platforms&apos; official interfaces (TikTok&apos;s Commercial Content API, Meta&apos;s Instagram API, which only
          shares public posts of business and creator accounts), or the customer adding a post by its link. We don&apos;t scrape
          profiles, read private accounts or stories, or collect anything about your private life.
        </p>
      </Section>

      <Section title="3. Why, and on what legal basis">
        <p>
          To check whether the music in a commercial post is licensed for that use, and to keep a record of the check. The customer
          relies on its legitimate interest in protecting and licensing its music rights (Art. 6(1)(f) GDPR). Bekvor makes no legal
          judgement and takes no decision about you: every result is a signal for a person at the customer to review (no automated
          decision under Art. 22 GDPR). Bekvor never contacts you on a customer&apos;s behalf.
        </p>
      </Section>

      <Section title="4. Who receives it">
        <p>
          Only the customer&apos;s own team, inside its workspace; another customer never sees it. Bekvor&apos;s hosting and database
          providers process it on our behalf (see our <Link className={A} href="/privacy">privacy policy</Link>). Nothing is sold or used
          to train AI models.
        </p>
      </Section>

      <Section title="5. How long">
        <p>
          While the customer uses Bekvor and needs the record of a check, then it is deleted with the customer&apos;s workspace. When a
          customer takes your account off its list, nothing new is fetched; what was found stays with any open case until the customer
          deletes it. Uploaded videos and sounds are deleted right after the check.
        </p>
      </Section>

      <Section title="6. Your rights">
        <p>
          You can ask for access to your data (Art. 15 GDPR), its correction (16), erasure (17) or restriction (18), and{" "}
          <strong className="text-tx">object to the processing (Art. 21)</strong>. Send your request to the company that watches your
          account, or to us at {privacyMail}; we forward it and help the customer answer it. You can also complain to a data protection
          supervisory authority (Art. 77 GDPR).
        </p>
      </Section>
    </div>
  );
}
