import type { Platform } from "./types";

/**
 * Where each channel stands. The one place that says which platforms are
 * live, so the landing page, docs and any "connect a channel" screen read the
 * same answer instead of each hard-coding "TikTok".
 *
 * - `BETA`: a real connector exists and is what the beta watches.
 * - `NEXT`: the next channel to build; the schema and connector interface
 *   already allow it, no code runs yet.
 * - `PLANNED`: intended, after `NEXT`; no date.
 *
 * Moving a channel forward is a one-line change here, made when its connector
 * ships (see ARCHITECTURE.md → "Adding a channel").
 */
export type ChannelStage = "BETA" | "NEXT" | "PLANNED";

export const CHANNEL_STAGES: Record<Platform, ChannelStage> = {
  TIKTOK: "BETA",
  INSTAGRAM: "NEXT",
  YOUTUBE: "PLANNED",
};

/** Channels in display order: the live one first, then by stage. */
export function orderedChannels(): Platform[] {
  const rank: Record<ChannelStage, number> = { BETA: 0, NEXT: 1, PLANNED: 2 };
  return (Object.keys(CHANNEL_STAGES) as Platform[]).sort((a, b) => rank[CHANNEL_STAGES[a]] - rank[CHANNEL_STAGES[b]]);
}

export function isChannelLive(platform: Platform): boolean {
  return CHANNEL_STAGES[platform] === "BETA";
}
