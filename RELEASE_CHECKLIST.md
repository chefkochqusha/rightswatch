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
- [ ] **Name "Bekvor" (domain bekvor.com bought 2026-10-09)**: a web search found
  no brand or company of that name, but that is not a register search. Search
  TMview (EU, DE, US), DPMAregister and the Handelsregister, classes 9, 35 and 42,
  including similar-sounding names (e.g. Beko, an appliance brand). Then decide
  on a trademark application (DPMA from about 290 EUR, EU mark about 850 EUR).
  Also: point bekvor.com at the Vercel project, set the production URL and the
  e-mail sender domain (SPF, DKIM, DMARC), and update the User-Agent in
  `musicbrainz.ts` and the artwork route to the new URL.
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

- [ ] **Landing page wording**: the pricing section and the billing page state
  net monthly prices, the 14-day trial, monthly renewal until cancelled and
  cancelling in the app (2026-10-05); add the VAT line and the final terms once
  the business status and terms are settled. The "Book a demo" call to action from
  the Brief is "Try the demo" (the public demo workspace) until a booking
  link or sales inbox exists.

Added 2026-10-05 from the security and compliance pass (`SECURITY.md`,
`DATA_FLOWS.md`). Each of these is a decision or a document, not code:

- [ ] **VAT and tax** (tax advisor). Sell to businesses only (the signup box and
  the pricing text say so). EU business customers with a valid VAT ID: reverse
  charge. Sales to consumers in other EU countries are taxed at the customer's
  country rate once the one-stop-shop threshold is passed (the "from the first
  euro" claim in the reels is a simplification: confirm the threshold and your
  small-business status). Turn on **Stripe Tax** so the invoices carry the right
  rate and collect VAT IDs. US sales tax: decide whether to sell to US customers
  at all; if yes, state thresholds (around $100k or 200 sales) need registration.
- [ ] **14-day withdrawal right** applies to consumers only. Keep the product
  B2B-only (done in the UI) and say so in the terms; if consumers are ever
  allowed, the checkout needs the explicit waiver for digital content.
- [ ] **Chargebacks**: watch the dispute rate in Stripe (a few percent starts
  trouble with the card networks); answer every dispute in time; keep the
  invoice and the audit log as evidence.
- [ ] **Trademark check for "Bekvor"** before the launch video and any ads.
  A first web search found no obvious conflict, which proves nothing. Search
  DPMAregister, EUIPO TMview and WIPO Global Brand Database in the music and
  software classes (9, 35, 41, 42), plus the domain and app names; a trademark
  lawyer for the final answer.
- [ ] **Terms (AGB) with a lawyer**: liability limits that German law allows
  (intent and gross negligence cannot be excluded), a place of jurisdiction, and
  a **data processing agreement (AVV)** to sign with each customer, because
  Bekvor processes their creators' data. The reels' US-style class-action
  waiver and arbitration clause do not carry over; a lawyer decides what does.
- [ ] **Privacy policy lists every service in `DATA_FLOWS.md`** (Vercel, Neon,
  Stripe, Resend, TikTok, AudD, MusicBrainz, Cover Art Archive), the 7-day (or
  plan-dependent) backup lag after deletion, and the one session cookie. Also: an
  imprint with a real address (Impressum) — missing or wrong ones are what
  gets a warning letter (Abmahnung) in Germany, typically 500–1,500 € in lawyer fees
  and a contractual penalty if repeated.
- [ ] **Data processing agreements with the providers**: Vercel, Neon, Stripe,
  Resend, AudD. Ask each where data is stored and which transfer mechanism covers
  the US.
- [ ] **Marketing email and texts**: none are sent today (only password reset and
  confirmation). For a launch newsletter: double opt-in, imprint data, a working
  unsubscribe link, and a postal address for US readers (CAN-SPAM). Never text a
  phone number without written consent; the product collects none.
- [ ] **Registered DMCA agent / takedown contact**: only needed if users can upload
  content. There are no uploads. Revisit when `CaseEvidence` is built.
- [ ] **AI Act, Art. 50 (chatbot must say it is an AI)**: the text applies from
  2 August 2026 (artificialintelligenceact.eu, checked 2026-10-05); I could not
  check for transitional rules. Not relevant while there is no chatbot or AI
  feature; before adding one, add the notice and ask the lawyer.
- [ ] **Launch video and ads**: no invented customers, quotes or "I used it"
  testimonials (a presenter demos the product, never poses as a customer); put
  "AI voice" in the video description. Lawyer to confirm the wording.
- [ ] **Subscription wording final review**: the pricing section and billing page
  now say "for businesses, net of tax, 14-day trial without a card, monthly,
  renews until cancelled, cancel in the app". Add the VAT line once the tax status
  is settled.
- [ ] **Idea, not decided: loyalty pricing** (the price falls every month a
  customer stays; cancelling and coming back starts at the top price). Needs a
  plan-catalog and Stripe price-schedule change, an unmistakable explanation in
  the pricing text and the terms, and a lawyer's look (cancelling must stay as
  easy as signing up). Nothing is built.

- [ ] **`LEGAL_DE.md` re-check** (German/EU rules register, 2026-10-08): Data Act
  switching clauses in the terms and no switching fees from 12 Jan 2027;
  e-invoices (ZUGFeRD/XRechnung) for German business customers from 2027/2028;
  imprint under § 5 DDG with no OS-platform link; B2B-only made factual (VAT ID
  at checkout) so the BFSG and the withdrawal button stay out of scope.

- [ ] **Hosting decision: own EU server (prepared) or Vercel Pro.** `SELF_HOSTING.md`
  and `deploy/` hold a ready Docker setup (app, Postgres, HTTPS, daily scan,
  encrypted backups). Owner: EU server account (about 10–40 €/month), DPA with
  the provider, domain, an age key pair for backups; then SSH access for the
  first deploy and the move from Neon.

- [ ] **Loyalty pricing and partner programme** (built 2026-10-08). Owner: confirm
  the numbers (monthly −10 % from month 2, +2 %/month, −30 % from month 12;
  yearly −30 %; partners 10 % for 12 months), have the lawyer review the
  pricing text and `/partner-terms` (draft), ask the tax advisor how partner
  commissions are invoiced (credit notes, VAT). **Before taking real monthly
  payments in Stripe, the loyalty discount must be applied by Stripe**
  (`STRIPE_INTEGRATION.md`, step 6). Payout of commissions is manual for now:
  monthly bank transfer from €50.

## Own server and own song recognition (added 2026-10-10)

- [ ] **First real deploy of `deploy/compose.yml`.** The images (app,
  recognizer) and the Caddy config could not be built or checked in the
  development environment (Docker Hub is blocked there); the same processes
  were tested directly: Postgres, the recognition service, the app with the
  worker, uploads, matching and the job queue. Expect small fixes on the first
  `docker compose up`.
- [ ] **Round 2 with real music**: 20–50 real songs and 5–10 real TikTok posts
  that use some of them; re-run `services/recognizer/calibrate.py` on them and
  set `RECOGNITION_MATCH_RATIO` / `RECOGNITION_CANDIDATE_RATIO` /
  `RECOGNITION_MIN_SCORE`. Only then decide on `RECOGNITION_AUTO_IDENTIFY`.
- [ ] **Patent check** (patent attorney): landmark-pair audio matching
  (US6990453, US7627477 and European equivalents) before paying customers rely
  on own recognition.
- [ ] **DSA duties for uploads** (lawyer): reporting address or form for illegal
  content (Art. 16) and contact point (Art. 11/12) on the imprint; upload rules
  in the terms (Art. 14). See `LEGAL_DE.md`.
- [ ] **Terms and AVV for uploads** (lawyer): customer warrants rights in the
  recordings it uploads and licenses Bekvor to process them for fingerprints;
  post videos (creators' personal data) processed on the customer's behalf and
  deleted after the check; privacy policy to mention both.
- [ ] **TikTok terms on fetching post audio** (lawyer): until clarified, post
  audio comes only from the customer's own upload; nothing is downloaded from
  TikTok.
- [ ] **Server size**: the recognizer uses about 1 CPU-second per 30 s post with
  30 songs; set `RECOGNIZER_CPUS`/`RECOGNIZER_MEMORY` to the server (default 2
  CPUs, 2 GB) and watch it with the first customers.
- [ ] **`RECOGNIZER_TOKEN`**: a long random value in `deploy/.env`, never in git.

## Services & credentials

- [ ] **Vercel plan: Pro, before launch** (owner). Vercel's Hobby (free) plan is
  "restricted to non-commercial personal use only"; commercial usage is any
  deployment used for the financial gain of anyone involved, including "any
  method of requesting or processing payment from visitors" and "advertising the
  sale of a product or service" (Vercel Fair Use Guidelines, checked 2026-10-06).
  A paid SaaS with Stripe checkout and a pricing page is commercial. Check
  Settings → Billing for the project's current plan (I cannot read it: the
  Vercel connection is refused for this account). Pro is about 20 USD per
  developer seat and month plus usage above the included credit, has a free
  trial, and unlocks Spend Management (a spend limit with pause), 1 day instead
  of 1 hour of runtime logs, and team seats. Upgrade at the latest before the
  first customer, the paid pricing page being promoted, or the launch video going
  out.
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
  `Bekvor <no-reply@yourdomain>`) and `APP_URL` (the public https
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

Added 2026-10-05 (details in `SECURITY.md`, `BACKUP_RESTORE.md`, `INCIDENT_RESPONSE.md`):

- [ ] **Dev and prod separation** (owner, in Vercel and Neon): turn on preview
  branching in the Neon integration, give `SESSION_SECRET`, `CRON_SECRET` and every
  key a Production-only scope with separate Preview values (Stripe test keys; no
  AudD, TikTok or Resend key in previews), keep Deployment Protection on. Until
  then a preview build runs `prisma db push && prisma db seed` against the
  production database.
- [ ] **Neon plan and backups**: check which plan the project is on (history
  window: Free 6 hours, Launch up to 7 days, Scale up to 30 days) and choose one
  you accept before real customer data; ask Neon how backups are encrypted;
  then run the restore drill once together (`BACKUP_RESTORE.md`).
- [ ] **Vercel spend limit** and pause rule (Spend Management is a Pro feature,
  see above), and know where attack-challenge mode
  is (a flood bills by usage even on static pages).
- [ ] **Fill in `INCIDENT_RESPONSE.md`**: lawyer, data protection authority,
  support address, who decides.
- [ ] **AudD spending cap**: scans send at most 200 posts to AudD each
  (`AUDD_MAX_POSTS_PER_SCAN` changes it). Pick the number with the price list in hand.

## Final

- [ ] **Acceptance test on production**: sign up, run a scan, open and work a
  case, invite a teammate, subscribe, log out and back in.
- [ ] **Launch video** of the finished product. A 20 s cut exists (HyperFrames,
  real app screenshots, placeholder beat bed, no voiceover). Still open: the ad
  **voiceover with ElevenLabs** (owner: account on a plan that allows commercial
  use, pick a voice, generate the lines I write, send me the audio files — no API
  key needed in chat), and a licensed music track in place of the placeholder bed.
- [ ] **Warm up the public demo** after the first deploy on a fresh database: click
  "Try the demo" once. The first visit fills the demo workspace (about a minute
  on a slow database); later visits are instant.
- [x] **Content-Security-Policy** — done (2026-10-05): `proxy.ts` sends a CSP with a
  per-request script nonce, every page renders per request. Re-check it in the
  browser console after adding any third-party script, font or embed (Stripe
  Checkout redirects are already allowed).
- [ ] **Security re-check before real customer data**: `SECURITY.md` has the
  audit and what is still open (shared rate limits, `SESSION_SECRET` as
  Sensitive, dev/prod separation, the Prisma and lint-tool advisories, logins in
  the audit log, deleting a single member's account). Re-run the checks in its
  "After a change" section on the live address.

## UI kit

- [x] **Watermelon UI** (ui.watermelon.sh, MIT, free): the project is set up for
  its shadcn registry (`components.json`, `cn` in `src/lib/utils.ts`).
  `npx shadcn@latest add https://registry.watermelon.sh/r/<block>.json` pulls a
  block into `src/components`. Its blocks come with their own dependencies
  (react-icons, Radix/base-ui) and a stock look, so restyle any block with the
  tokens in `globals.css` before it goes on a page. The channels section on the
  landing page is adapted from its integrations cards.

