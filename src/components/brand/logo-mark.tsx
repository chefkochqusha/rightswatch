import { BRAND } from "@/lib/brand";

/**
 * Bekvor's mark: a lowercase "b" whose bowl is a record with its centre
 * hole, white on the brand blue. The same drawing as `src/app/icon.svg`
 * (the favicon); plain SVG, so it also renders inside `ImageResponse`.
 * Decorative wherever the name stands next to it.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={className}>
      <rect width="64" height="64" rx="15" fill={BRAND.color} />
      <rect x="15" y="11" width="9" height="42" rx="4.5" fill="#fff" />
      <circle cx="35.5" cy="38" r="11.5" fill="none" stroke="#fff" strokeWidth="9" />
      <circle cx="35.5" cy="38" r="3" fill="#fff" />
    </svg>
  );
}
