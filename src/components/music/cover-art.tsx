"use client";

import { useCallback, useState } from "react";
import { artworkSrc, generatedCover, type GeneratedCover } from "./artwork";

/**
 * A song's cover: the release's real one when there is one, a generated
 * one otherwise — and the generated one stays underneath a real cover, so
 * a cover that fails to load leaves a finished-looking square, never a
 * broken image. Always next to the song's title in the UI, so the image
 * itself is decorative (`alt=""`).
 *
 * A Client Component for one reason: noticing a failed load. A cover that
 * fails before hydration has already fired its error event, so the ref
 * checks for that too, the way Next's own `Image` does.
 */
export function CoverArt({
  title,
  artist,
  artworkUrl,
  className = "",
}: {
  title: string;
  artist: string | null;
  artworkUrl?: string | null;
  className?: string;
}) {
  const src = artworkSrc(artworkUrl);
  const [failed, setFailed] = useState(false);
  const cover = generatedCover(title, artist);
  const checkLoaded = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  return (
    <span aria-hidden="true" className={`relative block overflow-hidden ${className}`} style={{ backgroundColor: cover.background }}>
      <GeneratedCoverArt cover={cover} />
      {src && !failed && (
        // A plain <img>: the cover comes through this app's own artwork
        // route, already sized for a list, so there's nothing for Next's
        // image optimizer to do.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={checkLoaded}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  );
}

/** Two decimals: server and browser must print the same coordinates, and
 *  `Math.cos` isn't guaranteed to agree to the last digit between engines. */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The generated cover's artwork, on a 100×100 canvas that fills its box. */
export function GeneratedCoverArt({ cover }: { cover: GeneratedCover }) {
  const { foreground: fg, accent, variation: v } = cover;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      {cover.motif === "rings" && (
        <g fill="none" stroke={fg} strokeWidth="2.4">
          {[10, 19, 28, 37, 46, 55].map((r) => (
            <circle key={r} cx={r2(28 + v * 44)} cy={r2(72 - v * 36)} r={r} opacity={r2(1 - r / 80)} />
          ))}
          <circle cx={r2(28 + v * 44)} cy={r2(72 - v * 36)} r="4" fill={accent} stroke="none" />
        </g>
      )}
      {cover.motif === "bars" &&
        [0, 1, 2, 3, 4, 5, 6].map((i) => {
          const width = r2(18 + ((v * 997 * (i + 3)) % 1) * 64);
          return <rect key={i} x="12" y={16 + i * 10.5} width={width} height="5.5" rx="2.75" fill={i === 3 ? accent : fg} />;
        })}
      {cover.motif === "orbit" && (
        <>
          <circle cx={r2(46 + v * 10)} cy={54} r="31" fill={fg} />
          <circle
            cx={r2(46 + v * 10 + 42 * Math.cos(v * Math.PI * 2))}
            cy={r2(54 + 42 * Math.sin(v * Math.PI * 2))}
            r="8"
            fill={accent}
          />
          <circle cx={r2(46 + v * 10)} cy={54} r="42" fill="none" stroke={fg} strokeWidth="0.8" opacity="0.55" />
        </>
      )}
      {cover.motif === "stripes" && (
        <g transform={`rotate(${r2(-24 - v * 30)} 50 50)`}>
          {[-60, -38, -16, 6, 28, 50, 72, 94, 116].map((x, i) => (
            <rect key={x} x={x} y="-40" width="11" height="180" fill={i === 4 ? accent : fg} opacity={i === 4 ? 1 : 0.85} />
          ))}
        </g>
      )}
      {cover.motif === "monogram" && (
        <>
          <text
            x="8"
            y="92"
            fill={fg}
            fontSize="88"
            fontWeight="700"
            letterSpacing="-4"
            fontFamily='-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, ui-sans-serif, system-ui, sans-serif'
          >
            {cover.initial}
          </text>
          <rect x="70" y="12" width="18" height="4" rx="2" fill={accent} />
        </>
      )}
      {cover.motif === "wave" && (
        <g fill="none" strokeLinecap="round">
          {[0, 1, 2, 3].map((line) => {
            const amplitude = r2(5 + line * 3 + v * 5);
            const y = 34 + line * 11;
            let d = `M -10 ${y}`;
            for (let x = -10; x < 110; x += 10) {
              const crest = (x + 10) % 20 === 0 ? y - amplitude : y + amplitude;
              d += ` Q ${x + 5} ${r2(crest)} ${x + 10} ${y}`;
            }
            return <path key={line} d={d} stroke={line === 1 ? accent : fg} strokeWidth="2.2" opacity={line === 1 ? 1 : 0.8} />;
          })}
        </g>
      )}
    </svg>
  );
}
