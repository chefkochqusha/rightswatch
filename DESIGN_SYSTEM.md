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
| Page title | `text-2xl font-semibold tracking-tight` | "Dashboard", "Notifications", "Team", "Billing", "Welcome, {name}" |
| Auth card title | `text-xl font-semibold tracking-tight` | Login / signup card heading |
| Section title | `text-sm font-semibold` | A card's own heading, e.g. "Rights assessments" |
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

Two distinct top-level nav bars exist today — both a single horizontal bar
under `border-b border-line`, inside a `max-w-(--content-width)` (1100px)
container — never the prototype's sidebar (see below):

**`AppHeader`** — Demo Mode's chrome (`/`, `/dashboard`, `/creators`,
`/assessments/*`). The RW mark and wordmark sit on the left, linking home;
two nav links (Dashboard, Creators) follow, with a pill active state
(`rounded-full bg-surface px-3 py-1.5 text-sm text-tx ring-1 ring-line`)
against an inactive, hoverable one (`rounded-full px-3 py-1.5 text-sm text-t2
hover:bg-hover hover:text-tx`). A "Demo Mode" pill, then Log in / Sign up,
sit on the right. The assessment detail page deliberately lights up no nav
item — it's reached by drilling into a row, not a primary section.

**`WorkspaceHeader`** — the real, authenticated chrome (`/workspace/*`).
Same RW mark, linking to the workspace home. Nav links: Notifications (with
an unread-count pill badge, `bg-review-bg text-review`, capped at "99+"),
Team, Billing — all visible to every role, since each destination page (not
the header) is what restricts its own mutations. Log out sits on the right,
as a form button rather than a link.

Cases are not their own nav destination in either header — a case is
reached by opening an item's row, the same pattern as the assessment-detail
page above; there's no standalone case list page today.

The prototype's original information architecture was a full sidebar with
nine sections: Overview, Creators, Music Matches, Cases, Rights Library,
Reports, Team, Billing, Settings. Only the subset the real app has actually
built appears in either real header above (Dashboard/Overview, Creators,
Team, Billing, plus Notifications, which the prototype didn't have). Music
Matches, a standalone Cases list, Rights Library (a rights-editing UI),
Reports, and Settings remain prototype-only — see "What's prototype-only"
below. This document doesn't add them to either real header, since doing so
would be inventing nav for pages that don't exist yet.

## Spacing, radius & layout

- **Page container:** `mx-auto max-w-(--content-width) px-6`, with
  `[--content-width:1100px]` set locally per page. `py-4` for header bars,
  `py-8` for main content.
- **Card / section radius:** `rounded-lg` (Tailwind's default, 0.5rem) — not
  the prototype's bespoke `1.125rem`. The real app leans on Tailwind's own
  scale pragmatically rather than matching the prototype pixel-for-pixel
  outside of color and font stack.
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

**Status badges** (`StatusBadge`, `CaseStatusBadge`) — `inline-flex w-fit
items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium
whitespace-nowrap`, with a small `h-1.5 w-1.5 rounded-full bg-current` dot
before the label. The color pair comes from the severity table above. This
is the one component every "is this okay?" signal in the app renders
through, whether it's a rights assessment or a case.

**Buttons & links:**
- Primary: `rounded-full bg-tx px-4 py-2 text-sm font-medium text-bg
  hover:opacity-90` — a dark pill with inverse text, using the near-black
  `--tx` token rather than the accent color. Used for every primary action
  in the app: workspace actions (e.g. "Send invite"; the header's pill
  "Sign up" link matches the same classes), the error/404 pages' "Try
  again" and "Back to dashboard", and the auth forms' submit buttons
  (`w-full rounded-full bg-tx px-4 py-2.5 ... text-bg` — `py-2.5` instead
  of `py-2`, otherwise the same treatment). The auth forms originally
  shipped with a second, different pattern (`rounded-lg bg-accent ...
  text-white`, closer to the validated prototype's own blue-button
  convention) that coexisted with this one; unified to this dark-pill
  pattern since it was already the app's majority convention everywhere
  else, rather than leaving two primary-button treatments in place.
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
text-tx`; input `mt-1.5 block w-full rounded-md border border-line bg-bg
px-3 py-2 text-sm text-tx placeholder:text-t2`; error text `mt-1.5
text-[0.8125rem] text-mismatch`. `FormField` itself adds no per-field focus
styling — it inherits the one global `:focus-visible` rule (see
"Accessibility") — and a `<select>` gets the same input treatment. The case
panel's note `<textarea>` is the one exception, adding its own explicit
`focus:ring-2 focus:ring-accent focus:outline-none`; treat `FormField`'s
plain approach as the default for any new field, not this one.

**Empty states** — centered text inside a card: heading `text-sm
font-semibold`, body `mx-auto mt-2 max-w-md text-sm text-t2`. Used
identically in both places this app currently needs one — "No scans yet"
(the workspace home, before "Run a sample scan" has ever been clicked) and
"No notifications yet" — so it's already an established pattern, not a
one-off, and the next empty table should reuse it rather than invent a
third variant.

**Notification list rows** — unread rows get a faint tinted background
(`bg-review-bg/40`) and a small solid dot (`h-2 w-2 rounded-full bg-review`)
before the text; read rows are plain. The whole row is a single `Link` to
the underlying item, never a button plus a separate link.

**Keyword marquee** (`components/marketing/keyword-marquee.tsx`) — a
full-bleed, continuously-scrolling strip of short keywords, `/dashboard`
only (today's de facto landing page — `/` redirects there). Two rows, each
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

- Sidebar navigation, and the Music Matches, Rights Library, Reports, and
  Settings sections (nor a standalone Cases list — see "Nav")
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
