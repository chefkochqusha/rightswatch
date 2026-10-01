# RightsWatch — Design System

## What this document is

`globals.css` cites this file by name for its design tokens ("Design tokens
(DESIGN_SYSTEM.md "Color")... These are the exact values from the validated
prototype") and for its typography stack; `components/layout/app-header.tsx`
cites it for "Nav." Like `ARCHITECTURE.md`, it didn't exist on disk until
now, despite being cited since early in this project.

This document describes the real, already-implemented conventions in
`src/app/globals.css` and `src/components/*` as the primary source of truth
— not a fresh restatement of the prototype it originated from. Where the
real app's implementation differs from the prototype (radii, the exact type
scale, the nav's information architecture), that's called out explicitly
rather than smoothed over, so this document never implies more is built than
actually is.

## Origin: the validated prototype

Before any of the real app existed, a single self-contained interactive HTML
file — `rightswatch-overview.html` — was built and validated as the
product's visual and interaction design: sidebar navigation, a data-dense
dashboard, a slide-over detail panel with spring-physics drag-to-dismiss, a
"Run scan" button with staged progress text, and cautious, non-legal-verdict
copy throughout. It lives outside this git repository, as a design reference
rather than shipped code.

`globals.css`'s color tokens are copied from it byte-for-byte — same hex
values, same variable role, same light/dark pairs — specifically so the real
app, the prototype, and this document never quietly disagree about what "the
accent blue" or "the cleared green" is. Its typography stack (real SF Pro on
macOS, Inter as the web-safe fallback, no bundled webfont) is copied the
same way. Layout, spacing, exact radii, and interaction design were **not**
copied 1:1 — the real app rebuilds those pragmatically with Tailwind utility
classes rather than replicating the prototype's bespoke CSS pixel-for-pixel.
See "What's prototype-only" at the end of this document for the interaction
design that exists only in the prototype today.

## Color

Defined once as CSS custom properties in `globals.css`, then re-exposed as
Tailwind theme colors (`@theme inline`) so components use `bg-surface`,
`text-t2`, `border-line`, and so on, rather than raw `var(--x)` names.

| Token (CSS var) | Tailwind name | Light | Dark | Role |
|---|---|---|---|---|
| `--bg` | `bg-bg` | `#f5f5f7` | `#000` | Page background |
| `--sf` | `bg-surface` | `#fff` | `#1c1c1e` | Card / surface background |
| `--sb` | `bg-surface-2` | `#ededf0` | `#111113` | Secondary surface (inputs, subtle fills) |
| `--tx` | `text-tx` | `#1d1d1f` | `#f5f5f7` | Primary text |
| `--t2` | `text-t2` | `#6e6e73` | `#a1a1a6` | Secondary text |
| `--ln` | `border-line` | `rgba(0,0,0,.09)` | `rgba(255,255,255,.13)` | Hairline borders |
| `--ac` | `text-accent` / `bg-accent` | `#0071e3` | `#2997ff` | Accent — text links, the focus ring, and text-selection highlight |
| `--hv` | `bg-hover` | `rgba(0,0,0,.045)` | `rgba(255,255,255,.07)` | Hover fill |

Dark mode is automatic (`@media (prefers-color-scheme: dark)`), not a manual
toggle — there's no UI anywhere in the app to switch it by hand.

### Rights-assessment severity colors

Mapped 1:1 to `RightsAssessmentStatus` (see `ARCHITECTURE.md` → "Rights
engine") and reused unchanged for `CaseStatus`, so a color always means the
same thing everywhere it appears:

| Status | Tailwind (text / bg) | Light text | Light bg | Dark text | Dark bg |
|---|---|---|---|---|---|
| `CLEARED` | `text-cleared` / `bg-cleared-bg` | `#1b7f3b` | `#e5f4e9` | `#5fd383` | `#10301c` |
| `REVIEW` | `text-review` / `bg-review-bg` | `#0058b0` | `#e6f0fc` | `#64b0ff` | `#0f2842` |
| `UNKNOWN` | `text-unknown` / `bg-unknown-bg` | `#9a5200` | `#fff0d9` | `#ffb454` | `#3a2a0e` |
| `POTENTIAL_MISMATCH` | `text-mismatch` / `bg-mismatch-bg` | `#c0281b` | `#fce7e5` | `#ff8078` | `#3f1916` |

`CaseStatus` reuses these same four tones rather than inventing new
semantics: `OPEN` → review tone (needs attention), `IN_PROGRESS` → unknown
tone (active/neutral), `RESOLVED` → cleared tone (clean outcome),
`DISMISSED` → plain `bg-hover text-t2` (inert — the same muted pill used for
"no data" states elsewhere).

## Typography

One font stack everywhere, defined once on `body` in `globals.css`:

```
-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text",
Inter, ui-sans-serif, system-ui, sans-serif
```

Real SF Pro for the MacBook-using customer the product targets, Inter as the
web-safe fallback elsewhere. No bundled webfont download — nothing to fetch,
nothing to flash unstyled while it loads.

The real app's implemented type scale is a small, consistent set of
Tailwind utility combinations, reused as-is on every page rather than each
page inventing its own sizes:

| Role | Classes | Used for |
|---|---|---|
| Page title | `PageHeader`: `text-[2rem] leading-[1.1] font-semibold tracking-[-0.02em]`, description `text-[0.9375rem] text-t2` | "Overview", "Creators", a creator's "@handle" — Brief §28's tight leading and negative tracking for large type. Pages not yet moved to `PageHeader` still use `text-2xl font-semibold tracking-tight` |
| Auth card title | `text-xl font-semibold tracking-tight` | Login / signup card heading |
| Section title | `text-[1.0625rem] font-semibold tracking-[-0.01em]` | A section's own heading, e.g. "Music matches", "Add a creator" (older sections: `text-sm font-semibold`) |
| Body / primary | `text-sm text-tx` (default color) | Table cells, row primary text |
| Secondary / caption | `text-sm text-t2` or `text-[0.8125rem] text-t2` | Subtitles, helper text, timestamps |
| Small label | `text-[0.8125rem] font-medium text-tx` | Form field labels |
| Badge / pill text | `text-xs font-medium` | `StatusBadge`, `CaseStatusBadge` |
| Numeric stat | `text-2xl font-semibold tabular-nums` | Dashboard `StatCard` counts |
| Wordmark | `text-[0.9375rem] font-semibold` | "RightsWatch" in both headers |

The prototype uses its own, more editorial fluid scale for a marketing-style
hero heading (`clamp(2rem, 4vw, 3rem)`, weight 650) and a denser numeric
display size (`2.25rem` for key-figure tiles). Nothing in the real app
currently needs a hero headline of that kind, so that size hasn't been
carried over — if a future marketing/landing surface needs one, the
prototype's `h1` rule is the reference to match, not a size to invent fresh.

## Nav

**The workspace sidebar** (`app/workspace/layout.tsx`,
`components/layout/workspace-nav.tsx`) — the authenticated app's chrome,
the prototype's layout carried over: a `15.5rem` sidebar on `bg-surface-2`
(sticky, full height) beside the content column. The RW mark and the
"RightsWatch" wordmark (sentence case, not tracked capitals) sit at the
top; below them the sections in Brief
§6's order (Overview, Creators, Music Matches, Cases, Rights Library,
Reports, Team, Billing, Settings), then a second group (Notifications with
its unread-count pill, `bg-review-bg text-review`, capped at "99+"; Audit
log). A section appears only once its page exists — no dead navigation
(Brief §63). Links are `rounded-[0.625rem] px-3 py-2 text-sm font-medium`;
the active one is `bg-surface text-tx ring-1 ring-line` with
`aria-current="page"`, the rest `text-t2 hover:bg-hover hover:text-tx`. A
detail page lights up the section it belongs to (an item's page lights up
the list it came from).

The content column opens with a top bar: the workspace's name, a "Demo
data" pill while scans run on demo data (`app/_lib/connector-mode.ts`),
and on the right who's signed in with their role beneath, and Log out (a
form button, not a link). Content sits in `max-w-[76rem] px-10 py-8`.

Below `md` (768px) the sidebar collapses into a block above the content:
the mark, then the same links in one horizontally scrolling row (Brief
§39: "sidebar becomes compact") — the prototype's own small-screen
behavior.

**`AppHeader`** — Demo Mode's chrome (`/dashboard`, `/creators`,
`/assessments/*`): a single horizontal bar with the RW mark, two pill nav
links (Dashboard, Creators), a "Demo Mode" pill, and Log in / Sign up.

## Spacing, radius & layout

- **Page container:** inside the workspace, the layout's content column
  (`max-w-[76rem] px-4 py-6 md:px-10 md:py-8`) — pages render straight into
  it. Demo Mode's pages use `mx-auto max-w-(--content-width) px-6` with
  `[--content-width:1100px]`, `py-4` for the header bar and `py-8` for main
  content.
- **Card / section radius:** `rounded-[1.125rem]` (18px) — Brief §31's
  "approximate radius 18–20px", and the prototype's own value. Inputs use
  `rounded-lg`, popovers and callouts `rounded-2xl`. Sections built before
  this was settled still use `rounded-lg`, and move over as each page is
  redesigned.
- **Pill radius:** `rounded-full` — nav pills, badges, the Demo Mode tag,
  and every primary button in the app, auth forms included (see "Buttons &
  links"). This one does match the prototype's `980px` (effectively a full
  pill at any of these sizes). Small utility buttons (secondary actions,
  "Copy") use `rounded-md` instead.
- **Borders:** `border border-line` (the hairline token above) on every
  card, input, and table-row divider — never a heavier default border
  color.
- **Surfaces:** `bg-surface` for cards and panels, `bg-surface-2` for a
  callout or secondary fill inside a card (e.g. the "copy this invite link"
  box), `bg-bg` for inputs sitting directly on the page background.

## Components

**Cards / sections** — `overflow-hidden rounded-lg border border-line
bg-surface`. A card with its own header uses a `border-b border-line px-5
py-4` band (title `text-sm font-semibold`, subtitle `mt-0.5
text-[0.8125rem] text-t2`) above the content.

**Stat tiles** — `rounded-lg border border-line bg-surface px-4 py-3.5`,
laid out `grid grid-cols-2 gap-3 sm:grid-cols-4`. The count uses `text-2xl
font-semibold tabular-nums`, colored by the status tone it represents; the
label sits below in `mt-0.5 text-[0.8125rem] text-t2`.

**Tables** — header row `border-b border-line text-[0.8125rem] text-t2`,
header cells `px-5 py-3 font-medium`; body rows `border-b border-line
last:border-0`, cells `px-5 py-3.5 align-top`. Primary text in the default
color, a secondary detail line underneath it in `text-t2` within the same
cell. Matches the prototype's table rhythm (a bold primary line with a
muted caption line beneath it) even though the exact class names differ.

**Status badges** (`StatusBadge`, `CreatorStatusBadge`) — icon, label and
color, never color alone (Brief §30): `inline-flex w-fit items-center
gap-1 rounded-full py-1 pr-2.5 pl-2 text-xs font-medium whitespace-nowrap`
with a 12px stroke icon from `components/ui/icons.tsx` before the label —
a check for Cleared/Active, an eye for Needs review, a question mark for
Unknown, a warning triangle for Potential mismatch/Error, a clock for
Pending, a pause glyph for Paused. The color pair comes from the severity
table above. `CaseStatusBadge` still uses the older dot and moves to icons
with the cases redesign.

**Buttons & links** — `buttonStyles(variant, size)` in
`components/ui/button.ts`, so a `<button>` and a `<Link>` acting as the
same control look the same. Every variant is a pill that scales to 0.97
while pressed (100ms ease-out — feedback on press, not release) and dims
when disabled:
- Primary: `bg-accent text-white hover:bg-accent-strong` — Brief §30's
  "primary action blue", one per view. This supersedes the earlier
  dark-pill primary (`bg-tx text-bg`), which pages built before
  `buttonStyles` still use until they're redesigned.
- Secondary: `bg-surface ring-1 ring-line` — any other action.
- Plain: accent text, a faint accent wash on hover — an action that reads
  as a link.
- Danger: red text, the mismatch tint on hover — removing something.
- Sizes: `sm` (32px tall, 0.8125rem) and `md` (36px, 0.875rem).
- Secondary / ghost: `rounded-full border border-line px-3 py-1.5
  text-[0.8125rem] font-medium text-t2 hover:bg-hover hover:text-tx` (e.g.
  "Mark all as read").
- Small utility: `rounded-md border border-line px-3 py-2
  text-[0.8125rem] font-medium text-t2 hover:bg-hover hover:text-tx` (e.g.
  "Copy" beside an invite link).
- Text links: plain `text-accent hover:underline`, often with
  `text-[0.8125rem] font-medium` sizing in-context (a table row's "View
  details," a card's "Edit rights record →"). This is the one place `--ac`
  is used directly as a text color rather than a background.
- Disabled state: `disabled:opacity-60`.

**Form fields** (`FormField`) — label `block text-[0.8125rem] font-medium
text-tx`; input `mt-1.5 block w-full rounded-lg border border-line bg-bg
px-3 py-2 text-sm text-tx placeholder:text-t2`, with a red border while
`aria-invalid`; below it either a hint (`text-t2`) or the error
(`text-mismatch`), tied to the input with `aria-describedby`. A country is
a `CountrySelect` with the same treatment, its options named on the server
(a browser's locale data can name a country differently and break
hydration). `FormField` itself adds no per-field focus
styling — it inherits the one global `:focus-visible` rule (see
"Accessibility") — and a `<select>` gets the same input treatment. The case
panel's note `<textarea>` is the one exception, adding its own explicit
`focus:ring-2 focus:ring-accent focus:outline-none`; treat `FormField`'s
plain approach as the default for any new field, not this one.

**Empty states** (`EmptyState`) — centered inside the section: a heading
that says plainly what isn't there yet, one sentence on how it fills, and
the action that fills it (Brief §36 — "No creators are being monitored
yet.", "No music matches detected.", "Nothing needs review right now.").
No illustration, no joke.

**Notification list rows** — unread rows get a faint tinted background
(`bg-review-bg/40`) and a small solid dot (`h-2 w-2 rounded-full bg-review`)
before the text; read rows are plain. The whole row is a single `Link` to
the underlying item, never a button plus a separate link.

**Keyword marquee** (`components/marketing/keyword-marquee.tsx`) — a
full-bleed, continuously-scrolling strip of short keywords. On `/dashboard`
it runs in the app's own tones; on the landing page it is `tone="band"`:
big display type, white on the brand-blue band. Two rows, each
scrolling the opposite direction: audience segments (the Brief's own four
customer types, §1) and capability phrases (held to the same cautious,
signal-not-verdict voice as everything under "Copy & tone" below). Words
alternate solid `text-tx` and an "outline" treatment (`marquee-outline-text`
in `globals.css`: transparent fill + `-webkit-text-stroke`, behind an
`@supports` check with a solid `text-t2` fallback for browsers that don't
implement it), separated by a small `bg-accent` dot — the same "solid dot
as separator" motif `StatusBadge` and notification rows already use, not a
new icon. This is the app's first shipped animation (see "Accessibility"
below for how it handles `prefers-reduced-motion`).

Both rows are `aria-hidden` (each word list renders twice for the seamless
loop, which would read as garbled repetition to a screen reader), so a
plain `sr-only` sentence carries the same information once, in reading
order, right before them — the one place on this page that states it in
text at all.

## Copy & tone

The prototype set a deliberately cautious, non-legal-verdict voice that the
real app's copy inherits directly:

- *"Risk is a workflow signal, not a legal judgement."*
- *"A potential rights mismatch is not a finding of infringement; have
  counsel review before acting on any case."*
- *"RightsWatch is an independent product and is not affiliated with
  TikTok."*
- *"Match confidence is confidence in the music identification, not
  confidence that a legal infringement occurred."*
- Demo Mode always discloses itself: *"Every creator, track and match here
  is a fictional fixture. No live TikTok data is shown."*

Any new copy near a status, a score, or a case should read against these
five lines before shipping — the product's credibility rests on never
implying a verdict it hasn't earned.

## Accessibility

- One global rule, not per-component styling: `:focus-visible { outline: 2px
  solid var(--ac); outline-offset: 2px; }` in `globals.css`. No component
  adds its own focus ring.
- `::selection` uses the accent color with white text, everywhere.
- The prototype additionally respects `prefers-reduced-motion` (disables its
  transitions and the sheet's spring physics), `prefers-contrast: more`
  (solid borders on cards/panels instead of the hairline token), and
  `prefers-reduced-transparency` (drops backdrop blur to a solid surface
  color). The real app's first shipped animation — the keyword marquee
  above — honors `prefers-reduced-motion` the same way (`globals.css`
  disables both scroll animations under that media query, leaving a static,
  fully-readable row). Nothing in the real app uses backdrop blur or
  triggers `prefers-contrast` yet; when something does, it should honor
  those two the same way, rather than skip them because "there's nothing
  there yet."

## What's prototype-only — not yet built

To keep this document from being read as a backlog in disguise, everything
below exists only in `rightswatch-overview.html`, not in the real app, and
isn't implied by anything above:

- The Music Matches, Rights Library, Reports, and Settings sections, and a
  standalone Cases list (the sidebar itself is built — see "Nav")
- The slide-over detail panel, its scrim, and its spring-physics
  drag-to-dismiss interaction
- The "Run scan" button's staged progress bar and status text
  ("Scanning 48 creators…" → "186 videos checked" → …)
- Toast confirmations (e.g. "Rights record saved — 2 matches
  re-evaluated.")
- An in-UI rights-record editor (territory checkboxes, commercial/organic
  toggles, license-term date pickers)

None of this is scheduled by being listed here — it's recorded so a future
reader doesn't mistake prototype interactivity validated earlier in this
project for functionality that has actually shipped.

## Document provenance

This document was assembled from `globals.css`'s own token comments, the
real component library under `src/components/*`, and
`rightswatch-overview.html` (the validated prototype `globals.css` cites by
name) — read in full as source material rather than reconstructed from
memory. Like `ARCHITECTURE.md`, nothing here is a new design decision; it's
the first time the real app's already-implemented conventions have been
written down in one place instead of living only as scattered comments and
the components themselves.

## Landing page (`src/app/(site)`)

The public pages (`/`, `/imprint`, `/privacy`) share one layout with the site
header and footer. They are deliberately *not* the app's quiet chrome:

- **Display type**: Bricolage Grotesque Variable with its optical-size axis
  (`@fontsource-variable`, self-hosted, so no request to Google), class
  `font-display`, weight 800 and tight tracking at headline sizes. Body copy
  stays on the app's system stack.
- **One signal colour**: `--color-ultra` (#1f3dff) for the marquee band and
  the closing section. Verdict colours appear only where they mean a verdict.
- **The hero is the product**: `components/marketing/hero-feed.tsx` shows the
  feed moving (three columns of video posters drifting past each other),
  built from the real `VideoPoster` and `StatusBadge`. Labelled demo data.
- **Motion**: the hero drift and the marquee only; both stop under
  `prefers-reduced-motion`. No per-section entrance animations.
- **Copy**: sentence case, "potential mismatch" never "infringement", no logos
  or testimonials, prices from `PLAN_CATALOG`.
