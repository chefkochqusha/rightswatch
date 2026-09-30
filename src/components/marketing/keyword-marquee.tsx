/**
 * A continuously-scrolling, full-bleed strip of short keywords/phrases —
 * task #64's "rolling banner." Reference: a marketing-site marquee of
 * customer-segment words with alternating solid/outlined type and a small
 * dot between each. Adapted here to this app's own palette, type scale and
 * restraint level (DESIGN_SYSTEM.md "Color"/"Typography") rather than the
 * reference's own branding — nothing in this file introduces a new color
 * or font. Only used on `/dashboard`, today's de facto landing page (`/`
 * redirects there) — not repeated on every Demo Mode page, the same way a
 * marketing marquee wouldn't repeat on every screen of a real product.
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
}: {
  items: readonly string[];
  direction?: "left" | "right";
  className?: string;
}) {
  const doubled = [...items, ...items];

  return (
    <div className={`overflow-hidden ${className}`} aria-hidden="true">
      <div
        className={`flex w-max shrink-0 items-center gap-x-10 ${
          direction === "left" ? "animate-marquee-left" : "animate-marquee-right"
        }`}
      >
        {doubled.map((label, i) => (
          <span key={i} className="flex shrink-0 items-center gap-x-10">
            <span
              className={
                i % 2 === 0
                  ? "text-2xl font-semibold tracking-tight text-tx sm:text-3xl"
                  : "marquee-outline-text text-2xl font-semibold tracking-tight sm:text-3xl"
              }
            >
              {label}
            </span>
            <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
          </span>
        ))}
      </div>
    </div>
  );
}
