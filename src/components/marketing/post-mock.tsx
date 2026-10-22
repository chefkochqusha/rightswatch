import { Heart, MessageCircle, Music2, Send } from "lucide-react";
import { SCENES, SONGS, type ShowcasePost } from "./showcase";
import { Sleeve } from "./sleeve";

/**
 * A made-up paid post as it looks in a feed: a product on a softly lit set,
 * the creator, the caption with its ad label, the sound running along the
 * bottom and the usual buttons on the right. Drawn, not photographed, so no
 * real person, account or brand appears; every size scales with its box
 * (container units), from a hero tile down to a thumbnail, where only the
 * set and the sound's disc are left. Decorative: the text beside it says the
 * same.
 */
export function PostMock({ post, compact = false, className = "" }: { post: ShowcasePost; compact?: boolean; className?: string }) {
  const scene = SCENES[post.scene];
  const song = SONGS[post.song];
  return (
    <span
      aria-hidden="true"
      className={`@container relative isolate block aspect-[9/16] overflow-hidden rounded-[0.875rem] ${className}`}
      style={{
        background: `radial-gradient(120% 70% at 30% 18%, ${scene.light}cc, transparent 58%), linear-gradient(165deg, ${scene.to}, ${scene.from} 78%)`,
      }}
    >
      {/* The table the product stands on, and its shadow. */}
      <span className="absolute inset-x-0 bottom-0 h-[34%] bg-gradient-to-b from-black/0 via-black/15 to-black/35" />
      <span className="absolute top-[63%] left-1/2 h-[4%] w-[46%] -translate-x-1/2 rounded-[50%] bg-black/35 blur-[3cqw]" />
      <span className="absolute top-[30%] left-1/2 -translate-x-1/2 text-[44cqw] leading-none drop-shadow-[0_2cqw_3cqw_rgba(0,0,0,0.35)] select-none">
        {scene.product}
      </span>
      {/* Grain, so the gradients read as light on a surface rather than flat colour. */}
      <span className="absolute inset-0 opacity-[0.18] mix-blend-overlay [background-image:radial-gradient(rgba(255,255,255,0.7)_0.5px,transparent_0.6px)] [background-size:3px_3px]" />

      {!compact && (
        <>
          <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
          <span className="absolute right-[4cqw] bottom-[30cqw] flex flex-col items-center gap-[5cqw] text-white/95">
            <Heart className="h-[9cqw] w-[9cqw]" fill="currentColor" strokeWidth={0} />
            <MessageCircle className="h-[9cqw] w-[9cqw]" fill="currentColor" strokeWidth={0} />
            <Send className="h-[8cqw] w-[8cqw]" fill="currentColor" strokeWidth={0} />
          </span>
          <span className="absolute right-[17cqw] bottom-[5cqw] left-[5cqw] text-white">
            <span className="block truncate text-[7cqw] leading-tight font-semibold">@{post.handle}</span>
            <span className="mt-[1cqw] block text-[5.6cqw] leading-snug text-white/90 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
              {post.caption}
            </span>
            <span className="mt-[2cqw] flex items-center gap-[1.5cqw] text-[5.4cqw] text-white/85">
              <Music2 className="h-[5cqw] w-[5cqw] shrink-0" />
              <span className="truncate">
                {song.title} · {song.short}
              </span>
            </span>
          </span>
        </>
      )}
      <span
        className={`absolute overflow-hidden rounded-full ring-white/70 motion-safe:animate-[spin_9s_linear_infinite] ${
          compact ? "right-[6cqw] bottom-[6cqw] h-[34cqw] w-[34cqw] ring-[1.5px]" : "right-[4cqw] bottom-[6cqw] h-[11cqw] w-[11cqw] ring-[0.6cqw]"
        }`}
      >
        <Sleeve song={post.song} disc />
      </span>
    </span>
  );
}
