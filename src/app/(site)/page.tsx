import type { Metadata } from "next";
import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { HeroFeed } from "@/components/marketing/hero-feed";
import { DemoButton } from "@/components/marketing/demo-button";
import { Channels } from "@/components/marketing/channels";
import { KeywordMarquee } from "@/components/marketing/keyword-marquee";
import { Hero } from "@/components/marketing/hero";
import { TrustedBy } from "@/components/marketing/trusted-by";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Bento } from "@/components/marketing/bento";
import { Pricing } from "@/components/marketing/pricing";
import { ClosingCta } from "@/components/marketing/closing-cta";
import { LOYALTY, monthOfMaxDiscount } from "@/modules/billing/loyalty";

// The "Try the demo" button runs a Server Action that fills the demo workspace on the
// first visit after a fresh database, which takes longer than the default limit.
export const maxDuration = 120;

export const metadata: Metadata = {
  title: "Bekvor: know where your music appears commercially",
  description:
    "Bekvor watches the paid posts of the TikTok creators you follow, finds your songs in them and checks each one against your licences.",
};

const WHO = ["Publishers", "Labels", "Licensing teams", "Sync agencies"] as const;
const WHAT = ["Paid posts", "Song matches", "Rights checks", "Cases"] as const;

const VERDICTS = [
  {
    status: "CLEARED",
    name: "Cleared",
    tone: "text-cleared",
    text: "A rights record covers this song, territory, date and usage. Nothing to do.",
  },
  {
    status: "REVIEW",
    name: "Needs review",
    tone: "text-review",
    text: "Your own records disagree about whether this use is allowed, so a person has to decide which one applies.",
  },
  {
    status: "UNKNOWN",
    name: "Unknown",
    tone: "text-unknown",
    text: "TikTok doesn't report a post's territory, and a post may name no campaign. If your records are limited to specific ones, the check can't tell either way.",
  },
  {
    status: "POTENTIAL_MISMATCH",
    name: "Potential mismatch",
    tone: "text-mismatch",
    text: "No record covers the post: the song has none, they ended before the post went up, or they exclude the territory or paid use.",
  },
] as const;

const FAQ = [
  {
    q: "Does Bekvor say a post breaks the rules?",
    a: "No. It tells you a post is a potential rights mismatch against the records you entered, and it says why. Whether that is a problem, and what to do about it, is for you and your counsel to decide.",
  },
  {
    q: "What does it watch?",
    a: "Commercial content: posts creators label as paid partnerships or ads, from the creators you add to your watchlist. It doesn't read private accounts and it doesn't scrape profiles.",
  },
  {
    q: "Where does the data come from?",
    a: "From TikTok's official Commercial Content API. That API lists a post and its brand, not the music in it, so Bekvor identifies the song separately. Until your workspace is connected, it runs on clearly labelled demo data.",
  },
  {
    q: "How does it know which songs are mine?",
    a: "You build the catalogue yourself: search for a song by title, artist or ISRC, or add it by hand, and record what your licences cover. Songs in a post that aren't in your catalogue are listed, but not checked.",
  },
  {
    q: "Can my whole team use it?",
    a: "Yes. Invite owners, admins, analysts and viewers. Owners, admins and analysts work cases; viewers read. Every change is kept in an audit log.",
  },
] as const;

export default function LandingPage() {
  return (
    <>
      <Hero
        actions={
          <>
            <Link href="/signup" className={`${buttonStyles("primary")} !h-12 !bg-ultra !text-white !px-6 !text-base hover:!opacity-90`}>
              Start monitoring
            </Link>
            <DemoButton className={`${buttonStyles("secondary")} !h-12 !px-6 !text-base`} />
          </>
        }
        aside={<HeroFeed />}
      />

      <TrustedBy />

      {/* Band */}
      <section className="overflow-hidden bg-ultra py-8 sm:py-10" aria-label="Who it is for and what it does">
        <p className="sr-only">
          Built for publishers, labels, licensing teams and sync agencies. It finds paid posts, matches songs, runs rights checks and opens cases.
        </p>
        <div className="space-y-3 sm:space-y-4">
          <KeywordMarquee items={WHO} tone="band" direction="left" />
          <KeywordMarquee items={WHAT} tone="band" direction="right" />
        </div>
      </section>

      <HowItWorks />

      {/* Verdicts */}
      <section id="verdicts" className="scroll-mt-8 border-y border-line bg-surface-2">
        <div className="mx-auto max-w-[80rem] px-5 py-24 sm:px-8 lg:py-32">
          <h2 className="max-w-3xl font-display text-[clamp(2.25rem,4.4vw,3.75rem)] leading-[1] font-extrabold tracking-[-0.03em]">
            Every match gets a verdict you can read.
          </h2>
          <p className="mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-t2">
            The rights check compares each post with your records: the song, the usage, the territory, the term and the campaign. It always says which of those didn&apos;t fit.
          </p>
          <dl className="mt-14 divide-y divide-line border-y border-line">
            {VERDICTS.map((verdict) => (
              <div key={verdict.status} className="grid gap-2 py-6 sm:grid-cols-[minmax(0,22rem)_1fr] sm:gap-10 sm:py-8">
                <dt className={`font-display text-[clamp(1.75rem,3.2vw,2.5rem)] leading-none font-bold tracking-[-0.03em] ${verdict.tone}`}>{verdict.name}</dt>
                <dd className="max-w-xl text-[1.0625rem] leading-relaxed text-tx/80">{verdict.text}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 max-w-xl text-[0.8125rem] text-t2">
            A verdict is a signal for review, not a legal finding.
          </p>
        </div>
      </section>

      <Bento />

      <Channels />

      <Pricing
        terms={
          <p>
            For businesses. Prices are per month and net of tax. The trial lasts 14 days and needs no card. Monthly billing renews until you cancel and
            gets cheaper the longer you stay: −{LOYALTY.firstStepPercent} % from month {LOYALTY.firstStepMonth}, then {LOYALTY.stepPercent} % more each
            month, up to −{LOYALTY.maxPercent} % from month {monthOfMaxDiscount()}. Yearly billing is −{LOYALTY.annualPercent} % from the start. You can
            cancel in the app at any time.
          </p>
        }
      />

      {/* FAQ */}
      <section id="faq" className="scroll-mt-8 border-t border-line bg-surface-2">
        <div className="mx-auto grid max-w-[80rem] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[1fr_1.5fr] lg:gap-20 lg:py-32">
          <h2 className="font-display text-[clamp(2.25rem,4.4vw,3.75rem)] leading-[1] font-extrabold tracking-[-0.03em]">Questions people ask first.</h2>
          <div className="divide-y divide-line border-y border-line">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[1.0625rem] font-medium [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span aria-hidden="true" className="text-2xl leading-none text-t2 transition-transform duration-200 group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-xl leading-relaxed text-t2">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <ClosingCta />
    </>
  );
}
