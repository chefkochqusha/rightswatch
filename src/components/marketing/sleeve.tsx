import { SONGS, type ShowcaseSongKey } from "./showcase";

/**
 * A cover for an example song: a printed sleeve in the manner of a classical
 * record, the composer's name set large, the piece small. Drawn for this
 * page (no label's artwork is copied), one colour pair per piece. As a disc
 * (on a post's sound) only the colours and a centre hole are left.
 */
const SLEEVES: Record<ShowcaseSongKey, { paper: string; ink: string; rule: string }> = {
  clairDeLune: { paper: "#18233d", ink: "#e9e2cf", rule: "#c9a44c" },
  reverie: { paper: "#e9e2cf", ink: "#18233d", rule: "#7d5a3c" },
  gymnopedie: { paper: "#efe7da", ink: "#2b2b2b", rule: "#b5523b" },
  furElise: { paper: "#5b2333", ink: "#f6e7d8", rule: "#e0a96d" },
  spring: { paper: "#d8e2dc", ink: "#1b4332", rule: "#74a57f" },
  nocturne: { paper: "#202124", ink: "#e6e1d6", rule: "#8ea8c3" },
  mountainKing: { paper: "#2e2a24", ink: "#e8d5b5", rule: "#b8432f" },
  sugarPlum: { paper: "#40263a", ink: "#f7c1bb", rule: "#e9dcd9" },
  canon: { paper: "#f4ecd8", ink: "#3a2f22", rule: "#6b4e16" },
  air: { paper: "#23395b", ink: "#dfe8f1", rule: "#f2c14e" },
};

export function Sleeve({ song, disc = false, className = "" }: { song: ShowcaseSongKey; disc?: boolean; className?: string }) {
  const { paper, ink, rule } = SLEEVES[song];
  const { title, composer } = SONGS[song];
  if (disc) {
    return (
      <span aria-hidden="true" className={`block h-full w-full ${className}`} style={{ background: `radial-gradient(circle, ${ink} 0 9%, ${paper} 10% 34%, ${rule} 35% 38%, ${paper} 39%)` }} />
    );
  }
  const surname = composer.split(" ").at(-1)!;
  return (
    // The box takes its size from the caller; the print inside scales with it (container units).
    <span aria-hidden="true" className={`@container relative block overflow-hidden ${className}`} style={{ backgroundColor: paper, color: ink }}>
      <span className="absolute inset-0 flex flex-col justify-between p-[9cqw]">
        <span className="block h-[2.5cqw] w-[30cqw]" style={{ backgroundColor: rule }} />
        <span className="block min-w-0">
          {/* Long names get smaller so they still fit on one line. */}
          <span className="block font-serif leading-[0.95] tracking-[-0.02em] uppercase" style={{ fontSize: `${Math.min(21, 128 / surname.length)}cqw` }}>
            {surname}
          </span>
          <span className="mt-[3cqw] block truncate font-serif text-[11cqw] leading-tight italic opacity-85">{title}</span>
        </span>
      </span>
    </span>
  );
}
