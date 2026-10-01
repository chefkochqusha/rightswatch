/**
 * A continuously-scrolling, full-bleed strip of short keywords/phrases —
 * task #64's "rolling banner." Reference: a marketing-site marquee of
 * customer-segment words with alternating solid/outlined type and a small
 * dot between each. Adapted here to this app's own palette, type scale and
 * restraint level (DESIGN_SYSTEM.md "Color"/"Typography") rather than the
 * reference's own branding — nothing in this file introduces a new color
 * or font. Only used on the landing page — not repeated on every
 * screen of the app, the same way a marketing marquee wouldn't repeat there.
 *
 * Two copies of `items` render back-to-back so the CSS animation
 * (`globals.css`) can loop seamlessly: it only ever translates by exactly
 * one copy's width (-50%), so the reset lands on an identical second copy
 * already in the first one's starting position. `aria-hidden`: this is
 * decorative repetition of things stated in plain text elsewhere on the
 * page, not unique content a screen reader should read out twice.
 */
export function KeywordMarquee({
  items,
  direction = "left",
  className = "",
  tone = "default",
}: {
  items: readonly string[];
  direction?: "left" | "right";
  className?: string;
  /** `band`: big display type in white on the brand-blue band. */
  tone?: "default" | "band";
}) {
  const band = tone === "band";
  const doubled = [...items, ...items];

  return (
    <div className={`overflow-hidden ${className}`} aria-hidden="true">
      <div
        className={`flex w-max shrink-0 items-center ${band ? "gap-x-14" : "gap-x-10"} ${
          direction === "left" ? "animate-marquee-left" : "animate-marquee-right"
        }`}
      >
        {doubled.map((label, i) => (
          <span key={i} className={`flex shrink-0 items-center ${band ? "gap-x-14" : "gap-x-10"}`}>
            <span
              className={
                band
                  ? `font-display text-[clamp(2.5rem,6vw,5rem)] leading-none font-extrabold tracking-[-0.03em] ${i % 2 === 0 ? "text-white" : "marquee-outline-inverse"}`
                  : i % 2 === 0
                    ? "text-2xl font-semibold tracking-tight text-tx sm:text-3xl"
                    : "marquee-outline-text text-2xl font-semibold tracking-tight sm:text-3xl"
              }
            >
              {label}
            </span>
            <span className={`shrink-0 rounded-full ${band ? "h-3 w-3 bg-white" : "h-2 w-2 bg-accent"}`} />
          </span>
        ))}
      </div>
    </div>
  );
}
