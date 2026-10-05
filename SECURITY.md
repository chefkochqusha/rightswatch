# Security

Last audit: 2026-10-05 (two passes), against the usual "vibe-coded site"
checklist plus supply chain, data protection and cost safety. What was checked,
what was found, what is still open. This is an engineering review, not a
penetration test and not legal advice. Companion files: `DATA_FLOWS.md`,
`INCIDENT_RESPONSE.md`, `BACKUP_RESTORE.md`, and the owner's list in
`RELEASE_CHECKLIST.md`.

## Checklist

| Check | Result |
|---|---|
| Secrets in git (history included) | Clean. Only test placeholders (`sk_test_123`, `whsec_123`, a local dev database URL). |
| `.gitignore` contains `.env` | Yes: `.env*` is ignored, `!.env.example` is the only exception. `git ls-files` lists only `.env.example`, and no `.env` was ever added in history. |
| API keys hidden | Server-side only. No key is read in a client component; `NEXT_PUBLIC_*` is not used. The production bundle (`.next/static`, 37 files) contains none of the secret names, no connection string, no `sk_`/`whsec_`, and ships no source maps; `public/` is empty. |
| Environment variables | Missing or weak `SESSION_SECRET` is logged; `CRON_SECRET` unset means the cron endpoint refuses everything; Stripe is all-or-nothing. |
| Password hashing | scrypt, per-user salt, OWASP minimum cost, constant-time compare; dummy hash on unknown emails so timing doesn't reveal accounts. |
| Authentication | Signed session cookie (httpOnly, Secure in production, SameSite=Lax) backed by a server-side session row that logout and password change revoke. |
| User access | Every Server Action calls a role check (`requireCaseManager` / `requireWorkspaceManager` / `requireSession`); every repository lookup is scoped by `workspaceId`; the demo workspace is a view-only role. |
| Admin routes | No separate admin area. Workspace owner/admin actions (billing, invites, full data export) need `requireWorkspaceManager`. |
| API endpoints | `songs/search`, `reports/export` and `settings/export` need a session; `cron/scans` needs `CRON_SECRET` (constant-time); the Stripe webhook verifies the signature; `artwork` accepts only a MusicBrainz release id and raster image types. |
| Rate limiting | Login (per email+IP and per IP), password reset, email verification, demo entry, workspace deletion, song search (40/min per member), artwork (120/min per address), data export (5/hour per member). In memory, per instance. |
| Forms / input | Server-side validation in every action (Zod or module checks); no `dangerouslySetInnerHTML`, `eval` or raw SQL anywhere. Prisma parameterises queries. CSV export neutralises formula cells. |
| XSS | React escapes output; Content-Security-Policy with a per-request script nonce and `strict-dynamic`. Links that come from outside (TikTok video links, stored post links, profile links) are shown only when they are plain `https:` addresses (`httpsUrl`), so a `javascript:` or `data:` link never reaches an `href`. |
| CSRF | Server Actions are POST-only and Next.js refuses them when the `Origin` header doesn't match the host; the cookie is SameSite=Lax. Nothing that changes data runs on GET (the exports only read, and write an activity-log line). A foreign page can start a download for a signed-in member but cannot read it. |
| CORS | No CORS headers are sent, so browsers keep every endpoint same-origin. |
| SSRF | The only server-side requests to a host a request can influence: none. Cover art goes to a fixed host with a validated UUID in the path; MusicBrainz, Resend, Stripe, TikTok and AudD are fixed addresses. The one place an outside address travels is the video link handed to AudD, which downloads it: only `https:` links without a login part go out, at most two per post. |
| Security headers | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS, `X-Powered-By` off, and the CSP above. |
| Debug mode | Production build on Vercel; the reset link on screen and other dev aids are gated on `NODE_ENV !== "production"`. Errors reach the browser as Next's generic message. |
| Exposed files | `public/` is empty; no source maps are published; no `.env` is tracked. |
| Database access | Neon (TLS only), one connection string in Vercel; the app never builds SQL by hand and no database key is ever sent to a browser. Tenancy is enforced in code: every query carries the `workspaceId`. |
| Row Level Security (RLS) | Not applicable the way it is for Supabase: there is no public database API or key, the browser never talks to Postgres. The risk RLS covers (a browser reading any row with the public key) does not exist here. Postgres RLS as a second layer under the code-level scoping is a possible hardening, not a gap. |
| Unused dependencies | None found (`depcheck`). |
| Prompt injection / AI data leaks | No AI or language-model feature exists, so nothing reads TikTok, AudD or customer text with a model. Rules for the day one is added are in `DATA_FLOWS.md`. |
| Malware / file uploads | No upload exists (`CaseEvidence` is in the schema but unbuilt, the `STORAGE_*` variables are blank). Before building it: size and type limits, a virus scan, private storage with short-lived links, never serve user files inline from this origin. |
| Audit log | Case, watchlist, song and rights changes, report and data downloads, **new 2026-10-05:** password changes, invites, plan choice and cancellation. Not yet in it: logins and logouts, failed logins (rate-limited but not recorded), member removal (no such feature yet). |
| PII in logs | Reviewed every `console.*`: the Stripe webhook logs event ids and outcomes only; the rehash and scheduled-scan lines log internal ids; the audit-write failure logs the action name only; error boundaries log to the browser console. No email, password, token or reset link is written to a log. Vercel's own request logs hold IP addresses and URLs (said in `DATA_FLOWS.md`). |
| Data deletion and export | Owner deletes a workspace (password + name typed, subscription ended first). **New:** Settings → "Download your data": a JSON file of the workspace (owners and admins) or of one's own account (every member), without password hashes, sessions or Stripe ids; audited, rate-limited, not available in the demo. A member cannot yet delete only their own account (handled by hand, see `DATA_FLOWS.md`). |
| Dependency pinning | **New:** every version in `package.json` is exact (`save-exact=true` in `.npmrc`) and `package-lock.json` is committed, so a build installs exactly what was tested. Dependabot opens one weekly pull request for minor and patch updates (`.github/dependabot.yml`). Install scripts run only for `prisma`, `@prisma/engines`, `esbuild`, `unrs-resolver` (and the optional `fsevents`). |
| Dependency advisories | See open item 1. |
| Cost safety | AudD: at most 200 posts per scan (`AUDD_MAX_POSTS_PER_SCAN`), https links only, two links per post; scans are bounded by plan cadence and a time budget and are plain loops (no function retries itself). Request limits above. A Vercel spend limit still has to be set by the owner (open item 6). |
| Cookies, fonts, tracking | One cookie (the session). Fonts are self-hosted (`@fontsource-variable`); with a real browser, `/`, `/login`, `/workspace` and `/workspace/rights` loaded from this origin only, so no Google Fonts, analytics or session replay. |
| Accessibility | axe-core (WCAG 2.0/2.1 A and AA) found no violations on the landing page, login, signup, workspace home, settings, billing, creators, rights library and audit log. The first Tab stop is a "Skip to content" link; every `<img>` on the landing page has an `alt`. Not covered: a screen-reader pass by a person. |
| Subscription terms | The pricing section and the billing page state: for businesses, net of tax, 14-day trial without a card, monthly billing that renews until cancelled, cancel in the app at any time. Final wording with the lawyer. |
| Business and age at signup | Signup needs a ticked box: business or professional use, at least 18. Not a legal opinion on COPPA or consumer law: it keeps the product a B2B one. |

## Dev and prod (open: needs the owner)

Preview deployments (every pull request or branch push) currently share the
production database and the production secrets, and the build runs
`prisma db push && prisma db seed` against whatever database it is given. A
preview of a half-finished branch can therefore change the production schema and
read or write customer data. Fix, in this order, before real customers:

1. Neon integration in Vercel: turn on **preview branching**. Neon then creates
   an isolated branch per preview deployment and injects its own `DATABASE_URL`
   at deploy time (Neon's Vercel integration documentation, checked 2026-10-05).
2. Give `SESSION_SECRET`, `CRON_SECRET` and every key a **Production-only**
   scope and set separate Preview values (Stripe test keys, no AudD or TikTok
   keys, no Resend key, so a preview can never charge, email or spend).
3. Keep Deployment Protection on for previews so only team members open them.

Local development already uses its own database (`npm run db:local`) and
`.env.local`, never production.

## Open items

1. **Advisories in build and lint tooling (`npm audit`: 9 high, 0 critical).**
   Prisma CLI: `deepmerge-ts` and `mysql2` (a MySQL driver the app never loads;
   the app talks to Postgres through `@prisma/adapter-pg`). `eslint-config-next`:
   `braces`, `micromatch`, `fast-glob` (lint of our own files). None of it is in
   the running application, and none sees untrusted input. The only automatic
   "fix" is a downgrade to Prisma 6 / `eslint-config-next` 14, which is worse.
   Wait for a stable Prisma 8 and a patched `eslint-config-next`; Dependabot will
   propose them.
2. **Rate limits are per serverless instance.** They slow a script down rather
   than stop it. A shared limit needs Upstash Redis (RELEASE_CHECKLIST.md).
3. **`SESSION_SECRET` stored as a readable secret** in Vercel. Re-enter a new
   32+ character value as *Sensitive* and redeploy (logs everyone out once).
4. **Signup reveals whether an email is registered.** Fixing it means
   confirming by email first, which needs Resend (RELEASE_CHECKLIST.md).
5. **CSP allows inline styles.** React's `style=""` attributes can't carry a
   nonce, and a style can't run code. Scripts are the part that matters.
6. **Spend limits.** Set a spend limit with pause in Vercel, and turn on its
   attack-challenge mode if a flood starts (the owner's Vercel dashboard). Usage on Vercel is billed, so even cheap
   pages cost money under a flood; the owner should read the plan's terms on
   what happens at the limit.
7. **Logins are not in the audit log**, and failed logins are only rate-limited.
8. **A member cannot delete only their own account** (see `DATA_FLOWS.md`).
9. **Restore drill not yet run** (`BACKUP_RESTORE.md`).

## After a change

Run `npm test`, `npx tsc --noEmit` and a production build; load `/`, `/login`
and a `/workspace` page in a browser and watch the console for
`Content Security Policy` messages. After touching a page, run axe-core on it.
After adding a service that receives data, update `DATA_FLOWS.md`.
