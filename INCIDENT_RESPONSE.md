# Incident response

What to do when something is wrong: a leaked key, someone else's data on screen,
a login nobody can explain. Keep it open on the day. Not legal advice; the
reporting steps below are the part to confirm with the lawyer.

## 0. The one rule on time

The 72 hours of GDPR Art. 33 run **from the moment the company becomes aware** of
the breach, not from the moment it happened ("not later than 72 hours after
having become aware of it"). Write down the exact time you became aware: it
starts the clock. A processor must tell its customer (the controller) "without
undue delay" (Art. 33(2)): in practice the same day.

## 1. First hour: contain

| Situation | Do this |
|---|---|
| A secret leaked (pasted in chat, committed, shown in a log) | Replace it at the provider **first**, then in Vercel: Stripe key (roll in the Stripe dashboard), `DATABASE_URL` (reset the role password in Neon, update Vercel), `RESEND_API_KEY`, `AUDD_API_TOKEN`, TikTok client secret, `CRON_SECRET`. Redeploy |
| Someone may hold a valid session | Set a new `SESSION_SECRET` (Sensitive) and redeploy: every signed cookie stops working. For one user: change their password (ends all their sessions). Last resort: `DELETE FROM sessions;` in the Neon SQL editor |
| Data of one customer visible to another | Pause the project in Vercel (Settings → Pause, or deploy a maintenance page), keep it paused until the cause is fixed and tested |
| Database credentials or backups exposed | Reset the Neon role password, check Neon's access log for the window, treat everything as read |
| Suspicious deploy or dependency | Roll back in Vercel to the last good deployment (Deployments → Promote), then investigate |
| Cost spike (bill, bandwidth, AudD) | Remove `AUDD_API_TOKEN` (recognition stops at once), pause the project, turn on Vercel's attack challenge mode / spend limit |

Then **preserve evidence**: export the Vercel runtime logs for the time window
(kept 1 hour on the Hobby plan, 1 day on Pro, per Vercel's plan comparison, so do it first), note deployment ids, copy the activity-log
rows (`/workspace/audit`) of the affected workspace.

## 2. Assess (same day)

- What data, whose, how many people, which workspaces?
- Was it only exposed, or was it read, changed or deleted?
- Is it **likely to result in a risk** to the people concerned? (Passwords, contact data and
  private notes: yes. A harmless public username list: probably not.)
- Is it still happening?

## 3. Tell the right people

| Who | When | How |
|---|---|---|
| **The customer** (workspace owner), as processor | Without undue delay, same day if their data is touched | Email from the support address: what happened, what data, what we did, what they must do |
| **The data protection authority** (the one for the company's seat; for a seat in Schleswig-Holstein that is the ULD, `datenschutzzentrum.de`) | Within **72 hours of becoming aware**, unless the breach is unlikely to result in a risk. A late report states the reason for the delay | The authority's online breach form |
| **The people concerned** | Without undue delay if the risk is **high** (Art. 34) | Plain language: what, which data, what to do (change passwords), who to ask |
| Stripe / TikTok / AudD | If their credentials or data are involved | Their security contacts |
| Insurance, lawyer | Early | Phone call first |

Fill in before launch: lawyer ____ · authority ____ · support address ____ ·
who decides (owner) ____ · phone number ____.

## 4. Record it (even if nobody has to be told)

Art. 33(5) asks for an internal record of every breach: facts, effects, measures.
One entry per incident in a private file (not in the repository):

```
Date/time aware:        Date/time it happened (if known):
What happened:
Data and people affected (count):
Risk assessment and why:
Who was told, when:
What was done, when:
Root cause:
What changes so it cannot repeat:
```

## 5. After

1. Find the root cause and fix it with a test.
2. Update `SECURITY.md` (what changed) and `DATA_FLOWS.md` if a flow was involved.
3. Rotate anything that was even possibly exposed, not only what was proven so.
4. Run the "After a change" check in `SECURITY.md`.

## Where the tools are

- Secrets: Vercel → Settings → Environment Variables (mark new values *Sensitive*).
- Sessions: `sessions` table; `SESSION_SECRET`.
- Who did what: `/workspace/audit` (case, watchlist, song and rights changes, password changes, invites, plan changes, data downloads, logins and wrong-password attempts).
- Restore: `BACKUP_RESTORE.md`.
