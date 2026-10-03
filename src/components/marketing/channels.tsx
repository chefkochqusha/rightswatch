import { PLATFORM_LABELS } from "@/components/rights/labels";
import { CHANNEL_STAGES, orderedChannels, type ChannelStage } from "@/modules/connectors/channels";
import type { Platform } from "@/modules/connectors/types";
import { cn } from "@/lib/utils";

/**
 * "Where it watches" — the one landing section that says the product starts on
 * TikTok and is built for more channels. Card layout adapted from Watermelon UI's
 * integrations blocks (MIT, ui.watermelon.sh), restyled with this app's tokens.
 * Which channel is at which stage comes from `CHANNEL_STAGES`, so the page can't
 * claim a channel the code doesn't have.
 */
const COPY: Record<Platform, string> = {
  TIKTOK: "Posts creators label as paid partnerships or ads, from the creators on your watchlist.",
  INSTAGRAM: "Paid partnerships on posts and reels, checked with the same catalogue, rights records and cases.",
  YOUTUBE: "Videos that disclose paid promotion, handled the same way.",
};

const STAGE: Record<ChannelStage, { label: string; chip: string }> = {
  BETA: { label: "Live in beta", chip: "bg-cleared-bg text-cleared" },
  NEXT: { label: "Next", chip: "bg-review-bg text-review" },
  PLANNED: { label: "Planned, no date", chip: "bg-surface-2 text-t2" },
};

export function Channels() {
  return (
    <section id="channels" className="scroll-mt-8 border-t border-line bg-surface-2">
      <div className="mx-auto max-w-[80rem] px-5 py-24 sm:px-8 lg:py-32">
        <h2 className="max-w-3xl font-display text-[clamp(2.25rem,4.4vw,3.75rem)] leading-[1] font-extrabold tracking-[-0.03em]">
          TikTok first. More channels next.
        </h2>
        <p className="mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-t2">
          The beta watches TikTok. Songs, rights records, verdicts and cases don&rsquo;t depend on the channel, so another one plugs in without changing how your team works.
        </p>

        <ul className="mt-12 grid gap-4 md:grid-cols-3">
          {orderedChannels().map((platform) => {
            const stage = STAGE[CHANNEL_STAGES[platform]];
            return (
              <li key={platform} className="flex flex-col rounded-2xl border border-line bg-surface p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-[1.5rem] font-bold tracking-[-0.02em]">{PLATFORM_LABELS[platform]}</h3>
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", stage.chip)}>{stage.label}</span>
                </div>
                <p className="mt-3 leading-relaxed text-t2">{COPY[platform]}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
