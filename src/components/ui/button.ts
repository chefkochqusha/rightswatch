/**
 * Button styles (Brief §30: the primary action is blue; §35: a press
 * answers instantly). One function, so a `<button>` and a `<Link>` that
 * act as the same kind of control look the same.
 *
 * - `primary` — the one main action in a view. Blue, white text.
 * - `secondary` — any other action: a quiet surface with a hairline ring.
 * - `plain` — an action that reads as a link (inline in text or a table).
 * - `danger` — an action that removes something; quiet until it matters.
 *
 * Every variant scales to 0.97 while pressed (100ms, ease-out) — feedback on
 * press, not on release — and dims when disabled.
 */
export type ButtonVariant = "primary" | "secondary" | "plain" | "danger";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-[transform,background-color,color,opacity] duration-100 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-strong",
  secondary: "bg-surface text-tx ring-1 ring-line ring-inset hover:bg-hover",
  plain: "text-accent hover:bg-accent/10",
  danger: "text-mismatch hover:bg-mismatch-bg",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[0.8125rem]",
  md: "h-9 px-4 text-sm",
};

export function buttonStyles(variant: ButtonVariant = "secondary", size: ButtonSize = "md"): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
}
