/**
 * Checks the Postgres job queue against a LOCAL database: 20 jobs, 5
 * workers claiming at once; every job must go to exactly one worker, and a
 * job whose heartbeat stopped must come back. Run:
 *   set -a && . ./.env.local && set +a && npx tsx scripts/local-db/queue-check.mts
 */
import assert from "node:assert/strict";
import { PrismaJobRepository } from "../../src/modules/jobs/prisma-repository";
import { getPrisma } from "../../src/lib/prisma-client";

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("Local database only.");

const type = `queue-check-${Date.now()}`;
const queue = new PrismaJobRepository();
try {
const ids = new Set<string>();
for (let i = 0; i < 20; i++) ids.add((await queue.enqueue({ workspaceId: null, type, payload: { i } })).id);

const claimed: string[] = [];
await Promise.all(
  Array.from({ length: 5 }, async (_, w) => {
    for (;;) {
      const job = await queue.claim(`w${w}`, [type], new Date());
      if (!job) return;
      claimed.push(job.id);
      await queue.complete(job.id, { by: w });
    }
  }),
);
assert.equal(claimed.length, 20, "every job claimed");
assert.equal(new Set(claimed).size, 20, "no job claimed twice");
assert.deepEqual(new Set(claimed), ids);

const stale = await queue.enqueue({ workspaceId: null, type, payload: null });
assert.equal((await queue.claim("dead", [type], new Date()))?.id, stale.id);
assert.equal(await queue.recoverStale(new Date(Date.now() - 60_000), new Date()), 0, "fresh heartbeat");
// Six minutes later, with no heartbeat in between:
assert.equal(await queue.recoverStale(new Date(Date.now() + 60_000), new Date()), 1);
const again = await queue.claim("alive", [type], new Date());
assert.equal(again?.id, stale.id);
assert.equal(again?.attempts, 2);
await queue.fail(stale.id, "boom", null);

} finally {
  await getPrisma().job.deleteMany({ where: { type } });
}
console.log("queue-check: ok (20 jobs, 5 workers, no double claims; stale job recovered)");
process.exit(0);
