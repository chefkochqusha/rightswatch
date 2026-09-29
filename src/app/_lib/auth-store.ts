import { InMemoryRateLimiter } from "@/modules/auth";
import {
  PrismaMembershipRepository,
  PrismaUserRepository,
  PrismaWorkspaceRepository,
} from "@/modules/auth/prisma-repositories";

/**
 * One shared identity store per server process. Prisma-backed as of Phase
 * 2 (Neon is live — see `prisma.config.ts`/`src/lib/prisma-client.ts`):
 * real signup/login/team-invite accounts are now durable Postgres rows,
 * not process memory. `modules/auth/in-memory-repositories.ts` still
 * exists and is still exercised by this module's own tests, but nothing
 * in `modules/auth`, the signup/login Server Actions, or the pages needed
 * to change for this swap — they all depend only on the repository
 * interfaces in `modules/auth/types.ts`.
 *
 * `InMemoryRateLimiter` deliberately stays as-is: login brute-force
 * protection is Redis-bound per the Master Brief, not part of this swap.
 */
interface AuthStore {
  users: PrismaUserRepository;
  workspaces: PrismaWorkspaceRepository;
  memberships: PrismaMembershipRepository;
  /** Login brute-force protection (see `modules/auth/rate-limiter.ts`) —
   *  shared across requests for the same reason the repositories are: a
   *  fresh one per request would never accumulate any failures. */
  loginRateLimiter: InMemoryRateLimiter;
}

const globalForAuth = globalThis as unknown as { __rightswatchAuthStore?: AuthStore };

export function getAuthStore(): AuthStore {
  if (!globalForAuth.__rightswatchAuthStore) {
    globalForAuth.__rightswatchAuthStore = {
      users: new PrismaUserRepository(),
      workspaces: new PrismaWorkspaceRepository(),
      memberships: new PrismaMembershipRepository(),
      loginRateLimiter: new InMemoryRateLimiter(),
    };
  }
  return globalForAuth.__rightswatchAuthStore;
}
