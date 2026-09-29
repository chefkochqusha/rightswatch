import {
  InMemoryMembershipRepository,
  InMemoryRateLimiter,
  InMemoryUserRepository,
  InMemoryWorkspaceRepository,
} from "@/modules/auth";

/**
 * One shared in-memory identity store per server process (see
 * `modules/auth/in-memory-repositories.ts` for why it's in-memory at all:
 * Phase 4's Prisma schema exists but `prisma generate` can't run in the
 * current build sandbox — ARCHITECTURE.md "Open decisions"). Swapping this
 * file's internals for Prisma-backed repositories later is the only change
 * needed to turn real signup/login from in-memory to durable — nothing in
 * `modules/auth`, the signup/login Server Actions, or the pages needs to
 * change, since they all depend only on the repository interfaces.
 *
 * Cached on `globalThis` so `next dev`'s module-reload-on-save doesn't wipe
 * every account created while testing this locally — a dev convenience,
 * not a durability guarantee. State is still lost on every process
 * restart or redeploy, and is never shared across serverless instances.
 */
interface AuthStore {
  users: InMemoryUserRepository;
  workspaces: InMemoryWorkspaceRepository;
  memberships: InMemoryMembershipRepository;
  /** Login brute-force protection (see `modules/auth/rate-limiter.ts`) —
   *  shared across requests for the same reason the repositories are: a
   *  fresh one per request would never accumulate any failures. */
  loginRateLimiter: InMemoryRateLimiter;
}

const globalForAuth = globalThis as unknown as { __rightswatchAuthStore?: AuthStore };

export function getAuthStore(): AuthStore {
  if (!globalForAuth.__rightswatchAuthStore) {
    globalForAuth.__rightswatchAuthStore = {
      users: new InMemoryUserRepository(),
      workspaces: new InMemoryWorkspaceRepository(),
      memberships: new InMemoryMembershipRepository(),
      loginRateLimiter: new InMemoryRateLimiter(),
    };
  }
  return globalForAuth.__rightswatchAuthStore;
}
