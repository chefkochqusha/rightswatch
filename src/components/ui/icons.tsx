/**
 * The handful of glyphs the app uses — status icons first (Brief §30: a
 * status is icon + label + color, never color alone). Stroke icons on a 16px
 * grid, drawn in `currentColor` so they take their tone from the text
 * around them, and hidden from assistive technology: the label next to
 * each one carries the meaning.
 */

type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? "h-3.5 w-3.5"}
    >
      {children}
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 8.5l3 3 6-7" />
    </Svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 2.5l6 10.5H2L8 2.5z" />
      <path d="M8 6.5v3" />
      <path d="M8 11.5h.01" />
    </Svg>
  );
}

export function QuestionIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M6.3 6.2a1.8 1.8 0 013.4.8c0 1.2-1.7 1.5-1.7 2.6" />
      <path d="M8 11.6h.01" />
    </Svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="1.8" />
    </Svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 4v8" />
      <path d="M10 4v8" />
    </Svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3.2l2 1.3" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 3v10" />
      <path d="M3 8h10" />
    </Svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </Svg>
  );
}

export function MusicIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 12V3.5l7-1.5v8.5" />
      <circle cx="4.5" cy="12" r="1.5" />
      <circle cx="11.5" cy="10.5" r="1.5" />
    </Svg>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.5 2.5h4v4" />
      <path d="M13.5 2.5L7.5 8.5" />
      <path d="M12 9.5V13a.5.5 0 01-.5.5h-8A.5.5 0 013 13V5a.5.5 0 01.5-.5H7" />
    </Svg>
  );
}
