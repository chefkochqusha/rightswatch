# Security

Last audit: 2026-10-05, against the usual "vibe-coded site" checklist (secrets,
auth, access, input, headers, dependencies). What was checked, what was found,
what is still open. This is an engineering review, not a penetration test.

## Checklist

| Check | Result |
|---|---|
| Secrets in git (history included) | Clean. Only test placeholders (`sk_test_123`, `whsec_123`, a local dev database URL). `.env*` is ignored except `.env.example`. |
| API keys hidden | Server-side only. No key is read in a client component; `NEXT_PUBLIC_*` isn't used. Set in Vercel, marked Sensitive. |
| Environment variables | Missing or weak `SESSION_SECRET` is logged; `CRON_SECRET` unset means the cron endpoint refuses everything; Stripe is all-or-nothing. |
| Password hashing | scrypt, per-user salt, OWASP minimum cost, constant-time compare; dummy hash on unknown emails so timing doesn't reveal accounts. |
| Authentication | Signed session cookie (httpOnly, Secure in production, SameSite=Lax) backed by a server-side session row that logout and password change revoke. |
| User access | Every Server Action calls a role check (`requireCaseManager` / `requireWorkspaceManager` / `requireSession`); every repository lookup is scoped by `workspaceId`; the demo workspace is a view-only role. |
| Admin routes | No separate admin area. Workspace owner/admin actions (billing, invites) need `requireWorkspaceManager`. |
| API endpoints | `songs/search` and `reports/export` need a session; `cron/scans` needs `CRON_SECRET` (constant-time); the Stripe webhook verifies the signature; `artwork` accepts only a MusicBrainz release id and raster image types. |
| Rate limiting | Login (per email+IP and per IP), password reset, email verification, demo entry. **Added 2026-10-05:** song search (40/min per member) and artwork (120/min per address). In memory, per instance. |
| Forms / input | Server-side validation in every action (Zod or module checks); no `dangerouslySetInnerHTML`, `eval` or raw SQL anywhere. Prisma parameterises queries. CSV export neutralises formula cells. |
| XSS | React escapes output; **added 2026-10-05:** Content-Security-Policy with a per-request script nonce and `strict-dynamic`. |
| CORS | No CORS headers are sent, so browsers keep every endpoint same-origin. Server Actions check the request origin themselves. |
| Security headers | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS, `X-Powered-By` off, and the CSP above. |
| Debug mode | Production build on Vercel; the reset link on screen and other dev aids are gated on `NODE_ENV !== "production"`. Errors reach the browser as Next's generic message. |
| Exposed files | `public/` is empty; no source maps are published; no `.env` is tracked. |
| Database access | Neon (which only accepts TLS connections), one connection string in Vercel; the app never builds SQL by hand. |
| Unused dependencies | None found (`depcheck`). |
| Dependencies up to date | See the first open item below. |

## Open items

1. **Prisma CLI advisories (4 high, `npm audit`).** `deepmerge-ts` and `mysql2`
   come in through the `prisma` command-line package that runs at build time.
   The app talks to Postgres through `@prisma/adapter-pg`, never loads
   `mysql2`, and passes no untrusted input to the CLI. The only automatic fix
   is a downgrade to Prisma 6, and the newest release is Prisma 8 RC. Wait for
   a stable Prisma 8 (or a 7.x patch) and upgrade then.
2. **Rate limits are per serverless instance.** They slow a script down rather
   than stop it. A shared limit needs Upstash Redis (RELEASE_CHECKLIST.md).
3. **`SESSION_SECRET` stored as a readable secret** in Vercel. Re-enter a new
   32+ character value as *Sensitive* and redeploy (logs everyone out once).
4. **Signup reveals whether an email is registered.** Fixing it means
   confirming by email first, which needs Resend (RELEASE_CHECKLIST.md).
5. **CSP allows inline styles.** React's `style=""` attributes can't carry a
   nonce, and a style can't run code. Scripts are the part that matters.

## After a change

Run `npm test`, `npx tsc --noEmit` and a production build; load `/`, `/login`
and a `/workspace` page in a browser and watch the console for
`Content Security Policy` messages.
