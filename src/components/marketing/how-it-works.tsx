import { Music2, ScanSearch, Users } from "lucide-react";
import { CoverArt } from "@/components/music/cover-art";
import { CreatorAvatar } from "@/components/creators/avatar";
import { VideoPoster } from "@/components/feed/video-poster";
import { StatusBadge } from "@/components/ui/status-badge";
import { SearchIcon } from "@/components/ui/icons";
import { Reveal, RevealItem } from "./reveal";

const STEPS = [
  { icon: Music2, title: "Add your songs", text: "Search like in a music app, then record what each song's licences cover." },
  { icon: Users, title: "Pick who to watch", text: "A TikTok username is enough. Pause or remove a creator any time." },
  { icon: ScanSearch, title: "Review what doesn't add up", text: "Every paid post with one of your songs gets a verdict and the reason for it." },
] as const;

const card = "rounded-2xl border border-line bg-surface/90 shadow-[0_12px_40px_rgba(0,0,0,0.10)] backdrop-blur-md";

/**
 * "How it works", after Watermelon UI's feature-5: the three steps on the left,
 * and on the right the three moments they produce, as floating cards that
 * drift slightly (CSS only, off with reduced motion). Demo data, labelled.
 */
export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-[80rem] scroll-mt-8 px-5 py-24 sm:px-8 lg:py-32">
      <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <Reveal>
          <RevealItem className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-[0.8125rem] text-t2">
            <span className="h-2 w-2 rounded-full bg-ultra" />
            How it works
          </RevealItem>
          <RevealItem as="h2" className="mt-5 font-display text-[clamp(2.25rem,4.4vw,3.75rem)] leading-[1] font-extrabold tracking-[-0.03em]">
            From a song to a verdict in three steps.
          </RevealItem>
          <RevealItem as="p" className="mt-5 max-w-md text-[1.0625rem] leading-relaxed text-t2">
            Nothing to install and nothing to upload. You say what you own and who to watch, and the rest runs on a schedule.
          </RevealItem>
          <Reveal as="ol" className="mt-9 space-y-5">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <RevealItem as="li" key={title} className="flex items-start gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ultra/10 text-ultra">
                  <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-medium">
                    <span className="text-t2">{i + 1}</span>&ensp;{title}
                  </span>
                  <span className="mt-0.5 block text-[0.9375rem] text-t2">{text}</span>
                </span>
              </RevealItem>
            ))}
          </Reveal>
        </Reveal>

        <div className="relative rounded-3xl bg-surface-2 p-5 shadow-[inset_0_0_8px_rgba(0,0,0,0.06)] sm:p-8">
          <div className="relative flex flex-col gap-4 lg:block lg:h-[30rem]">
            <div className={`${card} p-3 lg:absolute lg:top-0 lg:left-0 lg:w-[19rem] motion-safe:animate-[float_7s_ease-in-out_infinite]`}>
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

            <div className={`${card} z-10 p-4 lg:absolute lg:top-[9.5rem] lg:right-0 lg:w-[17rem] motion-safe:animate-[float_8s_ease-in-out_1s_infinite]`}>
              <p className="text-xs text-t2">Watchlist</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {["lena.creates", "maxstudio", "theurbanedit", "sophie.makes"].map((handle) => (
                  <li key={handle} className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pr-3 pl-1">
                    <CreatorAvatar handle={handle} displayName={null} className="h-5 w-5 text-[0.5625rem]" />
                    <span className="text-[0.8125rem]">@{handle}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={`${card} flex gap-3.5 p-3.5 lg:absolute lg:bottom-0 lg:left-8 lg:w-[22rem] motion-safe:animate-[float_9s_ease-in-out_2s_infinite]`}>
              <VideoPoster song={{ title: "Golden Hour", artist: "Riva" }} className="w-16 shrink-0 self-start" />
              <div className="min-w-0">
                <p className="text-[0.875rem] font-semibold">
                  @maxstudio <span className="font-normal text-t2">for Volt Coffee</span>
                </p>
                <p className="mt-0.5 text-[0.8125rem] text-t2">Golden Hour, Riva</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <StatusBadge status="POTENTIAL_MISMATCH" />
                </div>
                <p className="mt-1.5 text-[0.8125rem] leading-snug text-t2">The licence term doesn&apos;t cover the date of this post.</p>
              </div>
            </div>
          </div>
          <p className="mt-4 text-[0.75rem] text-t2 lg:mt-0 lg:absolute lg:right-6 lg:bottom-4">Demo data</p>
        </div>
      </div>
    </section>
  );
}
