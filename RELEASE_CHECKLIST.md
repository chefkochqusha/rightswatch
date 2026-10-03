# Release checklist

Everything here is deliberately left until release: it costs money, needs a
legal or tax decision, or needs company details that don't exist yet. The
product itself is built and tested without any of it — each item below
switches something on that's already in the code. Nothing here is needed to
keep developing.

Keep this file current: whenever a feature lands that needs an account, a key
or a business decision at release time, it gets a line here.

## Business & legal (owner, with a tax advisor / lawyer where needed)

- [ ] **Business registration and tax status** (e.g. small-business VAT
  exemption or not). Decides what goes into the imprint, Stripe and invoices.
- [ ] **Imprint (Impressum) and privacy policy (Datenschutzerklärung)** with
  real details, legally reviewed. The pages exist with placeholders.
- [ ] **Terms of service** for paying customers (Stripe asks for a terms URL).
- [ ] **TikTok API terms**: confirm commercial monitoring use is permitted
  (Master Brief §4: access and eligibility are an external dependency to be
  validated, never assumed).
- [ ] **MusicBrainz and Cover Art Archive** (song search and cover art in the
  Rights Library): the core song data is public domain (CC0), but check the
  terms for commercial use — MetaBrainz asks commercial users of its web
  service to support it — and name both in the privacy policy. Cover art is
  fetched by the server, never by the visitor's browser, so no visitor data
  goes to the Internet Archive.

- [ ] **Landing page wording**: the pricing section states net monthly prices
  and a 14-day free trial; add VAT wording and the cancellation terms once the
  business status and terms are settled. The "Book a demo" call to action from
  the Brief is "Try the demo" (the public demo workspace) until a booking
  link or sales inbox exists.

## Services & credentials

- [ ] **TikTok Commercial Content API** — apply at
  `developers.tiktok.com/application/commercial-content-api` (needs company
  details; approval takes a few days — the only item with lead time). Then set
  `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` in Vercel (and delete
  `DEMO_MODE`, or set it to `false`, if it is set there: it forces demo) and
  run one live scan. Master Brief §49: adding credentials flips DEMO → REAL;
  nothing else changes. The connector is written from TikTok's documentation
  and tested with stubbed answers only, so expect the first live call to need a
  small fix; a failure shows as "couldn't be fetched" with the reason on the
  creator. The public demo workspace stays on fake data either way.
- [ ] **Music identification (AudD)**: an AudD adapter is built
  (`modules/music/audd-provider.ts`) and stays off until `AUDD_API_TOKEN` is set
  in Vercel; without it posts are listed as "no song yet" and the team
  identifies them by hand. It is written against AudD's public docs and
  tested with a stubbed `fetch`, not yet against the live service: expect a
  small fix on the first real post. Costs about 5 USD per 1,000 requests; a
  scan sends every fetched post, and the daily re-fetch overlaps the day
  before, so a post is sent about twice. AudD gives no confidence score, so
  its matches carry a fixed 90 % (the settings page says so). Check AudD's and
  TikTok's terms for fetching a video by link before using it (also on the
  lawyer list).
- [ ] **Stripe** — follow `STRIPE_INTEGRATION.md`: sandbox first (products,
  customer portal, webhook destination, five env vars, redeploy, verify), then
  live mode with the real business details.
- [ ] **Transactional email (Resend)** — password reset and email
  confirmation work today; they only need the account. Create a Resend account, verify your sending domain
  (SPF/DKIM records), then set `RESEND_API_KEY`, `EMAIL_FROM` (e.g.
  `RightsWatch <no-reply@yourdomain>`) and `APP_URL` (the public https
  address) in Vercel. Until then production says email isn't set up and sends
  nothing; locally the reset link is shown on the page. The Resend request is
  tested with a stubbed `fetch`, not yet against the live service — try one
  reset email and one confirmation email on the first deploy. The
  "please confirm your email" banner only appears once these are set.
  `APP_URL` also sets the address in `sitemap.xml`, `robots.txt` and the link
  preview image; set it to the custom domain once there is one.
- [x] **`CRON_SECRET`** — set in Vercel (Production, sensitive) on 2026-10-03; live after the next deploy. Any long random value, set in Vercel. Vercel Cron
  calls `/api/cron/scans` once a day with it; without it the endpoint refuses
  every call. Scheduled scans only do anything once the real TikTok connector
  is on. The Growth plan promises scans every 6 hours: Vercel's free plan
  allows only daily cron jobs, so either move to a paid Vercel plan and change
  the schedule in `vercel.json`, or change the plan wording.
- [ ] **Upstash Redis** via the Vercel Marketplace — a login rate limit shared
  across serverless instances (and a real job queue, if scans outgrow cron).
- [ ] **Custom domain** (optional).
- [ ] **Fresh `SESSION_SECRET`** (still open: the current value is stored as a readable secret, so re-enter it as *Sensitive*): a new random value of at least 32 characters
  in Vercel (Settings → Environment Variables), then redeploy. Logs everyone
  out once.

## Final

- [ ] **Acceptance test on production**: sign up, run a scan, open and work a
  case, invite a teammate, subscribe, log out and back in.
- [ ] **Launch video** of the finished product (same approach as the earlier
  showreel: Opus + the brag-slim skill).
- [ ] **Warm up the public demo** after the first deploy on a fresh database: click
  "Try the demo" once. The first visit fills the demo workspace (about a minute
  on a slow database); later visits are instant.
- [ ] **Content-Security-Policy** — the standard security headers are set
  (`next.config.ts`); a CSP isn't, because Next's inline scripts need a
  per-request nonce first. Worth doing before real customer data; it is
  code work, no account needed.

## UI kit

- [x] **Watermelon UI** (ui.watermelon.sh, MIT, free): the project is set up for
  its shadcn registry (`components.json`, `cn` in `src/lib/utils.ts`).
  `npx shadcn@latest add https://registry.watermelon.sh/r/<block>.json` pulls a
  block into `src/components`. Its blocks come with their own dependencies
  (react-icons, Radix/base-ui) and a stock look, so restyle any block with the
  tokens in `globals.css` before it goes on a page. The channels section on the
  landing page is adapted from its integrations cards.

