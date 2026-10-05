# Backup and restore

Last checked 2026-10-05 against Neon's documentation. The numbers depend on the
Neon plan, so confirm the plan of the real project before relying on them.

## What is backed up, and for how long

RightsWatch keeps no backups of its own. Neon (the Postgres host) records every
change and can restore the database to any moment inside its **history window**
(point-in-time restore):

| Neon plan | History window |
|---|---|
| Free | 6 hours |
| Launch | up to 7 days |
| Scale | up to 30 days |

Longer windows cost extra storage. **Before real customer data: be on a plan
whose window you accept** (7 days is the least that covers a bad weekend) — see
`RELEASE_CHECKLIST.md`.

Everything else is rebuilt from the repository: the schema (`prisma/schema.prisma`,
applied at every deploy), the plan catalog (`prisma/seed.ts`), the demo workspace
(created on the first visit). Only customer data lives in the database alone.

## Encryption

Neon's restore documentation does not say how backups are encrypted, and this
file does not claim it. Ask Neon (security page, or their support) for: encryption
at rest, encryption in transit (connections require TLS), and their SOC 2 report,
and put the answers in the privacy policy's security section. For our own part:
no database dumps are made on anyone's laptop. If one ever has to be, encrypt it
(`age` or `gpg`), keep it in a private place, and delete it when done. The JSON
file from "Download your data" is the customer's own and is not encrypted.

## Restore

**Do not restore over production first.** Restoring is destructive for everything
written after the chosen moment.

1. **Look first, without touching production**: in the Neon console create a
   *branch* from a past point in time (Branches in the console; the option to
   branch from earlier data). It is an isolated copy.
2. Connect to the branch (its connection string) and check it: row counts of
   `users`, `workspaces`, `creators`, `rights_records`, the newest `audit_logs` entry.
3. If it is the state you want, either:
   - **restore the main branch** from that moment (Neon: Restore). Neon keeps the
     pre-restore state as an automatic backup branch and keeps the connection
     strings, so Vercel needs no change; or
   - copy only the missing rows back (for a single deleted record), using the branch as the source.
4. Open the app, log in, load `/workspace`, run a scan on the demo workspace.
5. Delete the temporary branch and the automatic backup branch when no longer needed.
6. Write it down in the incident record (`INCIDENT_RESPONSE.md`).

## Restore drill

A backup that has never been restored is a hope. **Run steps 1–2 once** (they
change nothing) and put the date here:

- Last drill: **not done yet** — to do before the first customer, with the owner at the Neon console.

## Deleted data and backups

When a customer deletes a workspace, it is gone from the live database at once
and from the backups when the history window has passed. The privacy policy
should say so ("up to 7 days" on the Launch plan).

## Deploys and the database

Every build runs `prisma db push && prisma db seed`. `db push` refuses a change
that would lose data unless `--accept-data-loss` is given, so a bad schema change
fails the build instead of dropping a column. Preview deployments must not run
this against the production database: see "Dev and prod" in `SECURITY.md`.
