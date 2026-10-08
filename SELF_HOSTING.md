# Running RightsWatch on our own server

The way off Vercel: one server in the EU running the app, Postgres, HTTPS,
the daily scan and encrypted nightly backups in Docker. Prepared 2026-10-08.
The standalone build was tested locally (pages, signup, invites, login,
account deletion), but **the Docker images themselves have not been built
yet**: there was no Docker engine in the development environment. Expect one
small fix on the first `docker compose up`.

## What it replaces

| Today (Vercel/Neon) | Own server (`deploy/`) |
|---|---|
| Vercel functions, US company | `app`: Next.js standalone build (`Dockerfile`) |
| Vercel Cron, daily | `cron`: calls `/api/cron/scans` at 04:30 UTC with `CRON_SECRET` |
| Neon Postgres | `db`: Postgres 17, reachable only from the other containers |
| Neon history window | `backup`: nightly `pg_dump`, encrypted with an age public key, kept 14 days |
| Vercel HTTPS and edge | `caddy`: automatic Let's Encrypt certificates, compression, 10 MB body limit |
| Build-time `prisma db push` | `migrate`: runs once per deploy, refuses data-losing schema changes |

## What the owner needs

1. **A server in the EU** from a company seated in the EU, for example Hetzner
   (Germany/Finland): 2–4 vCPU, 4–8 GB RAM, about 10–40 € a month. The song
   recognition will need the CPU later. Sign the provider's DPA (AVV).
2. **The domain** (once the name is settled), with an A record pointing at
   the server.
3. **An age key pair** for backups, made on your own computer: `age-keygen -o key.txt`.
   The public key (`age1…`) goes on the server; `key.txt` stays offline (a
   password manager or USB stick). Without it the backups can't be read, by
   anyone.

## First deploy (I can do it once I have SSH access)

```bash
# on the server, as a non-root user with Docker installed
git clone https://github.com/chefkochqusha/rightswatch.git && cd rightswatch
cp deploy/env.example deploy/.env && chmod 600 deploy/.env   # fill in the values
docker compose -f deploy/compose.yml up -d --build
docker compose -f deploy/compose.yml logs -f app migrate
```

Then: firewall open only for 22, 80, 443; SSH with keys only; automatic
security updates (`unattended-upgrades`).

## Moving the data from Neon

1. Put the site in maintenance mode or pause it on Vercel (so nothing is written).
2. `pg_dump --format=custom "$NEON_UNPOOLED_URL" > neon.dump` (from any machine with access).
3. Copy it to the server and run `docker compose -f deploy/compose.yml exec -T db pg_restore -U rightswatch -d rightswatch --clean --if-exists < neon.dump`.
4. Point the domain at the server, check login, a workspace and the demo.
5. Keep Neon and Vercel for a week, then delete both (export and keep one final dump, encrypted).

## Backups and restore

- Nightly at 03:15 UTC into `deploy/backups/` (ignored by git). **Copy them off
  the server** regularly (another provider's storage box, or a scheduled
  download), otherwise losing the server loses the backups too.
- Restore: `age -d -i key.txt rightswatch-<date>.dump.age > r.dump`, then
  `pg_restore` as above. Practise it once before the first customer
  (`BACKUP_RESTORE.md`).

## Still the same as on Vercel

Every environment variable from `.env.example` works the same (see
`deploy/env.example`). `APP_URL` must be the public https address. The
rate limits stay per instance, which on one server means one shared limit.

## What we take on ourselves

Server and Docker updates, watching disk space and the backups, and DDoS
defence. Caddy and the app limit what they can. For floods, put the domain
behind an EU-based DDoS/CDN service or the server provider's own protection
(Hetzner advertises free basic DDoS protection; check the current terms), and decide that before launch. A
flood can't produce a usage bill here: the server costs a fixed price.
