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

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 3.5L5.5 8l4.5 4.5" />
    </Svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3.5L10.5 8 6 12.5" />
    </Svg>
  );
}

/** Solid, unlike the rest: it sits on images, where a stroke gets lost. */
export function PlayIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className ?? "h-3.5 w-3.5"} fill="currentColor">
      <path d="M5 3.2v9.6a.6.6 0 00.9.5l7.6-4.8a.6.6 0 000-1L5.9 2.7a.6.6 0 00-.9.5z" />
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 7.2L8 2.5l5.5 4.7V13a.5.5 0 01-.5.5H9.5V10h-3v3.5H3a.5.5 0 01-.5-.5V7.2z" />
    </Svg>
  );
}

export function PeopleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6" cy="5.5" r="2.3" />
      <path d="M1.8 13.2c.5-2.2 2.2-3.5 4.2-3.5s3.7 1.3 4.2 3.5" />
      <path d="M10.6 3.4a2.2 2.2 0 010 4.2M12 9.9c1.2.4 2 1.6 2.3 3.3" />
    </Svg>
  );
}

export function LibraryIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 12.2V3.6l7-1.4v8.4" />
      <circle cx="4.4" cy="12.2" r="1.7" />
      <circle cx="11.4" cy="10.6" r="1.7" />
      <path d="M6 6.4l7-1.4" />
    </Svg>
  );
}

export function TeamIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="3" width="12" height="10" rx="2" />
      <circle cx="8" cy="7" r="1.8" />
      <path d="M5 11.2c.6-1.2 1.7-1.8 3-1.8s2.4.6 3 1.8" />
    </Svg>
  );
}

export function CardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.8" y="3.5" width="12.4" height="9" rx="1.8" />
      <path d="M1.8 6.6h12.4M4.5 10h2.5" />
    </Svg>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 10.8V7a4 4 0 018 0v3.8l1.2 1.4H2.8L4 10.8z" />
      <path d="M6.6 13.6a1.5 1.5 0 002.8 0" />
    </Svg>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.5 4h8M5.5 8h8M5.5 12h8" />
      <path d="M2.5 4h.01M2.5 8h.01M2.5 12h.01" />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.8 4.3h10.4M6.3 4.3V2.8h3.4v1.5M4.2 4.3l.6 8.6c0 .4.4.8.8.8h4.8c.4 0 .8-.4.8-.8l.6-8.6" />
    </Svg>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.6 2.9l2.5 2.5-7.6 7.6-3.1.6.6-3.1 7.6-7.6z" />
    </Svg>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c1.7 1.8 2.5 3.8 2.5 6S9.7 12.2 8 14C6.3 12.2 5.5 10.2 5.5 8S6.3 3.8 8 2z" />
    </Svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="3.2" width="12" height="10.6" rx="1.8" />
      <path d="M2 6.6h12M5.3 1.8v2.6M10.7 1.8v2.6" />
    </Svg>
  );
}

export function TagIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 2.5h5.2l5.8 5.8-5.2 5.2-5.8-5.8V2.5z" />
      <circle cx="5.3" cy="5.3" r=".9" />
    </Svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1.8 4.2c0-.6.5-1 1-1h3.1l1.5 1.6h5.8c.6 0 1 .4 1 1v6.4c0 .6-.4 1-1 1H2.8c-.5 0-1-.4-1-1V4.2z" />
    </Svg>
  );
}
