import { CoverArt } from "@/components/music/cover-art";
import { PlayIcon } from "@/components/ui/icons";

/**
 * What stands in for a video's thumbnail: TikTok's Commercial Content API
 * returns a post's link, not an image of it (Brief §4), so the poster is
 * built from the song the post uses — its cover, blown up and softened
 * behind a play mark, with the cover itself turning on a small disc in the
 * corner, where a music video names its sound. A post with no song
 * identified gets a plain poster.
 */
export function VideoPoster({
  song,
  className = "",
}: {
  song: { title: string; artist: string | null; artworkUrl?: string | null } | null;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={`relative isolate block aspect-[9/16] overflow-hidden rounded-[0.875rem] bg-[#2a2a2e] ${className}`}>
      {song && (
        // The cover sits in its own absolutely-sized wrapper: CoverArt is
        // `relative` itself, so putting `absolute` on it would lose to that
        // and leave it zero-high.
        <span className="absolute -inset-1/4 block scale-110 blur-xl saturate-[1.15]">
          <CoverArt title={song.title} artist={song.artist} artworkUrl={song.artworkUrl} className="h-full w-full" />
        </span>
      )}
      {/* A scrim, so the marks on top read on any cover. */}
      <span className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/55" />
      <span className="absolute top-1/2 left-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/22 text-white ring-1 ring-white/30 backdrop-blur-sm">
        <PlayIcon className="ml-0.5 h-3.5 w-3.5" />
      </span>
      {song && (
        <span className="absolute right-2 bottom-2 h-7 w-7 overflow-hidden rounded-full ring-2 ring-black/40">
          <CoverArt title={song.title} artist={song.artist} artworkUrl={song.artworkUrl} className="h-full w-full motion-safe:animate-[spin_9s_linear_infinite]" />
        </span>
      )}
    </span>
  );
}
