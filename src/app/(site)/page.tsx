import type { Metadata } from "next";
import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { HeroFeed } from "@/components/marketing/hero-feed";
import { DemoButton } from "@/components/marketing/demo-button";
import { KeywordMarquee } from "@/components/marketing/keyword-marquee";
import { CoverArt } from "@/components/music/cover-art";
import { CreatorAvatar } from "@/components/creators/avatar";
import { VideoPoster } from "@/components/feed/video-poster";
import { StatusBadge } from "@/components/ui/status-badge";
import { SearchIcon } from "@/components/ui/icons";
import { PLAN_CATALOG } from "@/modules/billing/plan-catalog";

export const metadata: Metadata = {
  title: "RightsWatch: know where your music appears commercially",
  description:
    "RightsWatch watches the paid posts of the TikTok creators you follow, finds your songs in them and checks each one against your licences.",
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
    q: "Does RightsWatch tell me a post is infringing?",
    a: "No. It tells you a post is a potential rights mismatch against the records you entered, and it says why. Whether that is a problem, and what to do about it, is for you and your counsel to decide.",
  },
  {
    q: "What does it watch?",
    a: "Commercial content: posts creators label as paid partnerships or ads, from the creators you add to your watchlist. It doesn't read private accounts and it doesn't scrape profiles.",
  },
  {
    q: "Where does the data come from?",
    a: "From TikTok's official Commercial Content API. That API lists a post and its brand, not the music in it, so RightsWatch identifies the song separately. Until your workspace is connected, it runs on clearly labelled demo data.",
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

const euros = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const CADENCE: Record<string, string> = {
  daily: "Scans every day",
  every_6h: "Scans every 6 hours",
  configurable: "Scan schedule you set",
};

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto grid max-w-[80rem] items-center gap-10 px-5 pt-28 pb-16 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:gap-6 lg:pt-32 lg:pb-24">
        <div>
          <h1 className="font-display text-[clamp(3rem,6.2vw,5.75rem)] leading-[0.95] font-extrabold tracking-[-0.035em]">
            Know where your music appears commercially.
          </h1>
          <p className="mt-7 max-w-[34rem] text-[1.1875rem] leading-relaxed text-t2">
            RightsWatch watches the paid posts of the TikTok creators you follow, hears which of your songs are in them, and checks each one against your licences. You review what doesn&apos;t add up.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/signup" className={`${buttonStyles("primary")} !h-12 !bg-ultra !px-6 !text-base hover:!opacity-90`}>
              Start monitoring
            </Link>
            <DemoButton className={`${buttonStyles("secondary")} !h-12 !px-6 !text-base`} />
          </div>
        </div>
        <HeroFeed />
      </section>

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

      {/* How it works */}
      <section id="how" className="mx-auto max-w-[80rem] scroll-mt-8 px-5 py-24 sm:px-8 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.5fr] lg:gap-20">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <h2 className="font-display text-[clamp(2.25rem,4.4vw,3.75rem)] leading-[1] font-extrabold tracking-[-0.03em]">
              From a song to a verdict in three steps.
            </h2>
            <p className="mt-5 max-w-sm text-[1.0625rem] leading-relaxed text-t2">
              Nothing to install and nothing to upload. You say what you own and who to watch, and the rest runs on a schedule.
            </p>
          </div>

          <ol className="space-y-16">
            <li>
              <p className="font-display text-[1.75rem] font-bold tracking-[-0.02em]"><span className="text-t2">1</span>&ensp;Add your songs</p>
              <p className="mt-2 max-w-md text-t2">Search like you would in a music app. Add a song, then record what its licences cover.</p>
              <div className="mt-6 max-w-md rounded-2xl border border-line bg-surface p-3">
                <div className="flex items-center gap-2.5 rounded-full bg-surface-2 px-4 py-2.5 text-sm text-t2">
                  <SearchIcon className="h-4 w-4" />
                  Midnight
                </div>
                <ul className="mt-2">
                  {[
                    ["Midnight Run", "Aiko", "Added"],
                    ["Midnight Signals", "Kova", "Add"],
                  ].map(([title, artist, state]) => (
                    <li key={title} className="flex items-center gap-3 rounded-xl px-2 py-2">
                      <CoverArt title={title} artist={artist} className="h-10 w-10 shrink-0 rounded-lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{title}</span>
                        <span className="block truncate text-[0.8125rem] text-t2">{artist}</span>
                      </span>
                      <span className={`text-[0.8125rem] font-medium ${state === "Added" ? "text-t2" : "text-accent"}`}>{state}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>

            <li>
              <p className="font-display text-[1.75rem] font-bold tracking-[-0.02em]"><span className="text-t2">2</span>&ensp;Pick who to watch</p>
              <p className="mt-2 max-w-md text-t2">A TikTok username is enough. Pause or remove a creator whenever you like.</p>
              <ul className="mt-6 flex max-w-lg flex-wrap gap-2">
                {["lena.creates", "maxstudio", "theurbanedit", "sophie.makes", "danbuilds", "nora.lifestyle"].map((handle) => (
                  <li key={handle} className="flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pr-3.5 pl-1.5">
                    <CreatorAvatar handle={handle} displayName={null} className="h-6 w-6 text-[0.625rem]" />
                    <span className="text-sm">@{handle}</span>
                  </li>
                ))}
              </ul>
            </li>

            <li>
              <p className="font-display text-[1.75rem] font-bold tracking-[-0.02em]"><span className="text-t2">3</span>&ensp;Review what doesn&apos;t add up</p>
              <p className="mt-2 max-w-md text-t2">Every paid post with one of your songs lands in a feed with a verdict and the reason for it.</p>
              <div className="mt-6 flex max-w-md gap-4 rounded-2xl border border-line bg-surface p-3.5">
                <VideoPoster song={{ title: "Golden Hour", artist: "Riva" }} className="w-20 shrink-0 self-start" />
                <div className="min-w-0">
                  <p className="text-[0.9375rem] font-semibold">@maxstudio <span className="font-normal text-t2">for Volt Coffee</span></p>
                  <p className="mt-0.5 text-[0.8125rem] text-t2">Golden Hour, Riva</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusBadge status="POTENTIAL_MISMATCH" />
                    <span className="text-[0.8125rem] font-medium">Term does not cover this date</span>
                  </div>
                  <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-t2">
                    Every rights record on file for this track has a term that does not cover the date this content was published.
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[0.8125rem] text-t2">Demo data.</p>
            </li>
          </ol>
        </div>
      </section>

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

      {/* Cases */}
      <section className="mx-auto max-w-[80rem] px-5 py-24 sm:px-8 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <h2 className="font-display text-[clamp(2.25rem,4.4vw,3.75rem)] leading-[1] font-extrabold tracking-[-0.03em]">
              A mismatch becomes a case your team can work.
            </h2>
          </div>
          <div className="space-y-6 text-[1.0625rem] leading-relaxed text-t2">
            <p>
              When a check comes back as anything other than cleared, RightsWatch opens a case with the post, the song, the verdict and the reason already attached. It stays open until someone resolves it or dismisses it. If you fix a rights record later, the post is checked again and the case stays attached to it.
            </p>
            <p>
              Your team gets a notification, notes stay with the case, and every change is written to an audit log that says who did what and when.
            </p>
            <DemoButton className={buttonStyles("secondary")}>See it in the demo</DemoButton>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-8 border-t border-line">
        <div className="mx-auto max-w-[80rem] px-5 py-24 sm:px-8 lg:py-32">
          <h2 className="font-display text-[clamp(2.25rem,4.4vw,3.75rem)] leading-[1] font-extrabold tracking-[-0.03em]">Priced by how many creators you watch.</h2>
          <p className="mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-t2">
            Every plan includes the song catalogue, rights records, cases and your whole team. You can try any of them free for 14 days.
          </p>
          <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-3">
            {PLAN_CATALOG.map((plan) => (
              <div key={plan.id} className="flex flex-col bg-bg p-7 sm:p-9">
                <h3 className="font-display text-xl font-bold tracking-[-0.02em]">{plan.name}</h3>
                <p className="mt-6 font-display text-[3.25rem] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
                  {euros.format(plan.priceCents / 100)}
                  <span className="ml-1.5 font-sans text-base font-normal tracking-normal text-t2">a month</span>
                </p>
                <ul className="mt-7 space-y-2 text-[0.9375rem]">
                  <li>Up to {plan.creatorCap.toLocaleString("en-US")} creators</li>
                  <li>{CADENCE[plan.scanCadence]}</li>
                </ul>
                <Link href="/signup" className={`${buttonStyles("secondary")} mt-9 self-start`}>
                  Start free trial
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

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

      {/* Close */}
      <section className="bg-ultra text-white">
        <div className="mx-auto max-w-[80rem] px-5 py-24 sm:px-8 lg:py-32">
          <h2 className="max-w-4xl font-display text-[clamp(2.75rem,6.4vw,5.5rem)] leading-[0.97] font-extrabold tracking-[-0.035em]">
            Find out where your songs are being used.
          </h2>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/signup" className="inline-flex h-12 items-center rounded-full bg-white px-6 text-base font-medium text-black transition active:scale-[0.97]">
              Start monitoring
            </Link>
            <DemoButton className="inline-flex h-12 items-center rounded-full px-6 text-base font-medium text-white ring-1 ring-white/50 ring-inset transition hover:bg-white/10 active:scale-[0.97]" />
          </div>
        </div>
      </section>
    </>
  );
}
