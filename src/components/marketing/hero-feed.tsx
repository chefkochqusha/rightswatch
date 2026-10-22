import { StatusBadge } from "@/components/ui/status-badge";
import { PostMock } from "./post-mock";
import { FEED, SHOWCASE_NOTE, SONGS, type ShowcasePost } from "./showcase";

function FeedTile({ post }: { post: ShowcasePost }) {
  const song = SONGS[post.song];
  return (
    <div className="w-full">
      <PostMock post={post} className="w-full shadow-[0_10px_30px_rgba(0,0,0,0.18)]" />
      <div className="mt-2.5 space-y-1.5 px-0.5">
        <p className="truncate text-[0.8125rem] leading-tight">
          <span className="font-semibold">{post.brand}</span>
        </p>
        <p className="truncate text-[0.75rem] text-t2">
          {song.title}, {song.short}
        </p>
        <StatusBadge status={post.status} />
      </div>
    </div>
  );
}

/**
 * The hero's picture: the product's feed, moving — paid posts, the song on
 * each, the verdict under it. Three columns drift at different speeds, the
 * middle one the other way; two on a phone, so each post stays readable.
 * Decorative (`aria-hidden`); the page says the same thing in words. The
 * label under it says what is real (the songs) and what isn't.
 */
export function HeroFeed() {
  return (
    <figure className="m-0">
      <div
        aria-hidden="true"
        className="relative h-[28rem] overflow-hidden sm:h-[36rem] lg:h-[42rem] [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_86%,transparent)]"
      >
        <div className="grid h-full grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {FEED.map((posts, index) => {
            const down = index === 1;
            return (
              <div key={index} className={index === 1 ? "pt-16" : index === 2 ? "hidden pt-6 sm:block" : ""}>
                <div className={down ? "animate-drift-down" : "animate-drift-up"} style={{ animationDuration: `${58 + index * 9}s` }}>
                  {[0, 1].map((copy) => (
                    <div key={copy} className="flex flex-col gap-4 pb-4 sm:gap-5 sm:pb-5">
                      {posts.map((post) => (
                        <FeedTile key={`${post.handle}-${post.song}-${post.scene}`} post={post} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <figcaption className="mt-3 text-[0.8125rem] text-t2">{SHOWCASE_NOTE}</figcaption>
    </figure>
  );
}
