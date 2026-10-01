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

## Services & credentials

- [ ] **TikTok Commercial Content API** — apply at
  `developers.tiktok.com/application/commercial-content-api` (needs company
  details; approval takes a few days — the only item with lead time). Then set
  `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` in Vercel and run one live scan.
  Master Brief §49: adding credentials flips DEMO → REAL; nothing else changes.
- [ ] **Music identification**: a paid provider (e.g. an audio-fingerprinting
  API) or manual identification by the team. Decide at release.
- [ ] **Stripe** — follow `STRIPE_INTEGRATION.md`: sandbox first (products,
  customer portal, webhook destination, five env vars, redeploy, verify), then
  live mode with the real business details.
- [ ] **Transactional email** (e.g. Resend) — password reset, email
  verification, invite emails.
- [ ] **Upstash Redis** via the Vercel Marketplace — scheduled scans and a
  login rate limit shared across serverless instances.
- [ ] **Custom domain** (optional).
- [ ] **Fresh `SESSION_SECRET`**: a new random value of at least 32 characters
  in Vercel (Settings → Environment Variables), then redeploy. Logs everyone
  out once.

## Final

- [ ] **Acceptance test on production**: sign up, run a scan, open and work a
  case, invite a teammate, subscribe, log out and back in.
- [ ] **Launch video** of the finished product (same approach as the earlier
  showreel: Opus + the brag-slim skill).
