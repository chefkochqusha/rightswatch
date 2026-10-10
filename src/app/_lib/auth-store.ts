import { createRateLimiter } from "./rate-limit-store";
import type {
  AccountRepository,
  MembershipRepository,
  RateLimiter,
  SessionRepository,
  UserRepository,
  WorkspaceRepository,
} from "@/modules/auth";
import {
  PrismaAccountRepository,
  PrismaMembershipRepository,
  PrismaSessionRepository,
  PrismaUserRepository,
  PrismaWorkspaceRepository,
} from "@/modules/auth/prisma-repositories";

/**
 * One shared identity store per server process. Users, workspaces,
 * memberships and sessions are durable Postgres rows (Neon); nothing in
 * `modules/auth` or the Server Actions depends on that — only on the
 * repository interfaces in `modules/auth/types.ts`.
 *
 * The rate limiters count in Postgres on Vercel and in memory on our own
 * server (`rate-limit-store.ts`).
 */
interface AuthStore {
  users: UserRepository;
  workspaces: WorkspaceRepository;
  memberships: MembershipRepository;
  accounts: AccountRepository;
  sessions: SessionRepository;
  /** Login failures per email + client IP: 5 per 15 minutes. */
  loginRateLimiter: RateLimiter;
  /** Login failures per client IP, across all emails: 30 per 15 minutes —
   *  enough headroom for an office behind one address, not for spraying. */
  loginIpRateLimiter: RateLimiter;
  /** Reset-link requests per email: 3 per 15 minutes, so one inbox can't be flooded. */
  resetRateLimiter: RateLimiter;
}

const globalForAuth = globalThis as unknown as { __rightswatchAuthStore?: AuthStore };

export function getAuthStore(): AuthStore {
  if (!globalForAuth.__rightswatchAuthStore) {
    globalForAuth.__rightswatchAuthStore = {
      users: new PrismaUserRepository(),
      workspaces: new PrismaWorkspaceRepository(),
      memberships: new PrismaMembershipRepository(),
      accounts: new PrismaAccountRepository(),
      sessions: new PrismaSessionRepository(),
      loginRateLimiter: createRateLimiter("login"),
      loginIpRateLimiter: createRateLimiter("login-ip", { maxAttempts: 30 }),
      resetRateLimiter: createRateLimiter("password-reset", { maxAttempts: 3 }),
    };
  }
  return globalForAuth.__rightswatchAuthStore;
}
