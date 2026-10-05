import Link from "next/link";
import type { CaseStatus } from "@/modules/cases";
import { httpsUrl } from "@/modules/connectors";
import type { StoredScanItem } from "@/modules/scan-results";
import { VideoPoster } from "./video-poster";
import { CoverArt } from "@/components/music/cover-art";
import { CreatorAvatar } from "@/components/creators/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { CaseStatusBadge } from "@/components/cases/case-status-badge";
import { ExternalIcon } from "@/components/ui/icons";
import { REASON_LABELS, formatConfidence } from "@/components/rights/labels";
import { formatRelativeTime } from "@/components/ui/time";

export interface DetectionSong {
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  inCatalogue: boolean;
}

/**
 * One commercial post in a feed (Brief §7 "Recent detections", as cards):
 * the post, who published it for which brand, the song RightsWatch heard
 * in it, and what the rights check says — the verdict first, in the
 * engine's own words. The whole card opens the post's page; the TikTok
 * link opens the post itself.
 */
export function DetectionCard({
  item,
  song,
  creatorDisplayName = null,
  caseStatus = null,
  showSong = true,
  isDemo = false,
  now = new Date(),
}: {
  item: StoredScanItem;
  song: DetectionSong | null;
  creatorDisplayName?: string | null;
  caseStatus?: CaseStatus | null;
  /** Off where the song is the page's subject already. */
  showSong?: boolean;
  /** A demo post links nowhere real, so it says so instead (Brief §48). */
  isDemo?: boolean;
  now?: Date;
}) {
  const { content } = item;
  const href = `/workspace/items/${encodeURIComponent(content.externalContentId)}`;
  const brands = content.brandNames.join(", ");
  const videoUrl = httpsUrl(content.videoUrls[0]);
  const match = item.kind === "ASSESSED" || item.kind === "OTHER_MUSIC" ? item.musicMatch : null;

  return (
    <article className="group relative flex min-w-0 gap-4 rounded-[1.125rem] border border-line bg-surface p-3 transition-[border-color,box-shadow] duration-200 hover:border-black/15 hover:shadow-[0_2px_12px_rgba(0,0,0,0.05)] sm:p-4">
      <VideoPoster song={song} className="w-[4.75rem] shrink-0 self-start sm:w-[5.5rem]" />

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <CreatorAvatar handle={item.creatorUsername} displayName={creatorDisplayName} className="h-8 w-8 text-xs" />
            <div className="min-w-0">
              <h3 className="truncate text-[0.9375rem] leading-tight font-semibold text-tx">
                <Link href={href} className="after:absolute after:inset-0 after:rounded-[1.125rem] focus-visible:outline-none">
                  @{item.creatorUsername}
                </Link>
              </h3>
              <p className="truncate text-[0.8125rem] text-t2">
                {brands ? `For ${brands}` : "Brand not named"}
                {content.label && <span className="ml-2 text-t2">{content.label}</span>}
              </p>
            </div>
          </div>
          <time dateTime={content.publishedAt.toISOString()} className="shrink-0 text-[0.8125rem] text-t2">
            {formatRelativeTime(content.publishedAt, now)}
          </time>
        </header>

        {showSong && match && (
          <p className="flex min-w-0 items-center gap-2 text-[0.8125rem]">
            <CoverArt title={match.title} artist={match.artist || null} artworkUrl={song?.artworkUrl} className="h-5 w-5 shrink-0 rounded" />
            <span className="truncate">
              <span className="font-medium text-tx">{match.title}</span>
              {match.artist && <span className="text-t2"> by {match.artist}</span>}
            </span>
            <span className="ml-auto shrink-0 text-t2 tabular-nums" title="Confidence in the music identification">
              {formatConfidence(match.confidence)}
            </span>
          </p>
        )}

        <div className="min-w-0">
          {item.kind === "ASSESSED" ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={item.assessment.status} />
                {item.assessment.reason && <span className="text-[0.8125rem] font-medium text-tx">{REASON_LABELS[item.assessment.reason]}</span>}
              </div>
              <p className="mt-1.5 line-clamp-2 text-[0.8125rem] leading-relaxed text-t2">{item.assessment.explanation}</p>
            </>
          ) : item.kind === "OTHER_MUSIC" ? (
            <p className="text-[0.8125rem] leading-relaxed text-t2">
              Not checked. {song?.inCatalogue ? "This song joined your catalogue after the post was found." : "This song isn't in your catalogue."}
            </p>
          ) : (
            <p className="text-[0.8125rem] leading-relaxed text-t2">
              {item.kind === "NO_MUSIC_MATCH" ? "No song identified in this post." : "Music identification didn't complete. The next scan tries again."}
            </p>
          )}
        </div>

        {(caseStatus || videoUrl || isDemo) && (
          <footer className="relative z-10 mt-auto flex flex-wrap items-center gap-2">
            {caseStatus && (
              <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-t2">
                Case <CaseStatusBadge status={caseStatus} />
              </span>
            )}
            {isDemo ? (
              <span className="ml-auto text-[0.8125rem] text-t2">Demo post, not on TikTok</span>
            ) : videoUrl && (
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.8125rem] font-medium text-accent hover:bg-accent/10"
              >
                View on TikTok
                <ExternalIcon className="h-3.5 w-3.5" />
              </a>
            )}
          </footer>
        )}
      </div>
    </article>
  );
}
