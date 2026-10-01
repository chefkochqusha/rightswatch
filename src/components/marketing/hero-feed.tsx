import { VideoPoster } from "@/components/feed/video-poster";
import { StatusBadge } from "@/components/ui/status-badge";
import type { RightsAssessmentStatus } from "@/modules/rights-engine/types";

interface Tile {
  handle: string;
  brand: string;
  song: string;
  artist: string;
  status: RightsAssessmentStatus;
}

// Brief §62's cast. None of these are real accounts or real posts.
const COLUMNS: readonly (readonly Tile[])[] = [
  [
    { handle: "lena.creates", brand: "Volt Coffee", song: "Midnight Run", artist: "Aiko", status: "CLEARED" },
    { handle: "maxstudio", brand: "Volt Coffee", song: "Golden Hour", artist: "Riva", status: "POTENTIAL_MISMATCH" },
    { handle: "nora.lifestyle", brand: "Feld & Co.", song: "Still Here", artist: "Nova", status: "CLEARED" },
    { handle: "danbuilds", brand: "NordHaus", song: "Afterglow", artist: "Mira", status: "UNKNOWN" },
  ],
  [
    { handle: "theurbanedit", brand: "NordHaus", song: "Signals", artist: "Kova", status: "REVIEW" },
    { handle: "sophie.makes", brand: "Feld & Co.", song: "Midnight Run", artist: "Aiko", status: "CLEARED" },
    { handle: "lena.creates", brand: "NordHaus", song: "City Lights", artist: "Demo Artist", status: "UNKNOWN" },
    { handle: "maxstudio", brand: "Feld & Co.", song: "Signals", artist: "Kova", status: "CLEARED" },
  ],
  [
    { handle: "danbuilds", brand: "Volt Coffee", song: "Golden Hour", artist: "Riva", status: "POTENTIAL_MISMATCH" },
    { handle: "nora.lifestyle", brand: "NordHaus", song: "Afterglow", artist: "Mira", status: "POTENTIAL_MISMATCH" },
    { handle: "sophie.makes", brand: "Volt Coffee", song: "Still Here", artist: "Nova", status: "CLEARED" },
    { handle: "theurbanedit", brand: "Feld & Co.", song: "Midnight Run", artist: "Aiko", status: "CLEARED" },
  ],
];

function FeedTile({ tile }: { tile: Tile }) {
  return (
    <div className="w-full">
      <VideoPoster song={{ title: tile.song, artist: tile.artist }} className="w-full shadow-[0_10px_30px_rgba(0,0,0,0.18)]" />
      <div className="mt-2.5 space-y-1.5 px-0.5">
        <p className="truncate text-[0.8125rem] leading-tight">
          <span className="font-semibold">@{tile.handle}</span>
          <span className="text-t2"> for {tile.brand}</span>
        </p>
        <p className="truncate text-[0.75rem] text-t2">
          {tile.song}, {tile.artist}
        </p>
        <StatusBadge status={tile.status} />
      </div>
    </div>
  );
}

/**
 * The hero's picture: the product's feed, moving — video posters, the song
 * on each, the verdict under it. Three columns drift at different speeds,
 * the middle one the other way. Decorative (`aria-hidden`); the page says
 * the same thing in words. The labels under it say the posts aren't real.
 */
export function HeroFeed() {
  return (
    <figure className="m-0">
      <div
        aria-hidden="true"
        className="relative h-[28rem] overflow-hidden sm:h-[36rem] lg:h-[42rem] [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_86%,transparent)]"
      >
        <div className="grid h-full grid-cols-3 gap-3 sm:gap-4">
          {COLUMNS.map((tiles, index) => {
            const down = index === 1;
            return (
              <div key={index} className={index === 1 ? "pt-16" : index === 2 ? "pt-6" : ""}>
                <div className={down ? "animate-drift-down" : "animate-drift-up"} style={{ animationDuration: `${58 + index * 9}s` }}>
                  {[0, 1].map((copy) => (
                    <div key={copy} className="flex flex-col gap-4 pb-4 sm:gap-5 sm:pb-5">
                      {tiles.map((tile) => (
                        <FeedTile key={`${tile.handle}-${tile.song}`} tile={tile} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <figcaption className="mt-3 text-[0.8125rem] text-t2">Demo data: made-up creators, songs and posts.</figcaption>
    </figure>
  );
}
