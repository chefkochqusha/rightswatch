export { hashPassword, verifyPassword } from './password';
export { createSessionToken, verifySessionToken } from './session';
export type { SessionPayload } from './session';

export type {
  Role,
  UserRecord,
  WorkspaceRecord,
  MembershipRecord,
  UserRepository,
  WorkspaceRepository,
  MembershipRepository,
} from './types';

export { slugify, generateUniqueSlug } from './slug';

export {
  InMemoryUserRepository,
  InMemoryWorkspaceRepository,
  InMemoryMembershipRepository,
} from './in-memory-repositories';

// `PrismaUserRepository`/`PrismaWorkspaceRepository`/
// `PrismaMembershipRepository` are deliberately NOT re-exported here — same
// reasoning as `modules/notifications/index.ts`: they transitively import
// `@/lib/prisma-client`, which needs the generated Prisma client (absent in
// this build sandbox) and a DB connection string, and this barrel is used
// by every in-memory-only consumer (including every test in this module).
// Import them directly from "@/modules/auth/prisma-repositories" once
// they're wired into `app/_lib/auth-store.ts`.

export { createUserAccount } from './create-user-account';
export type {
  CreateUserAccountInput,
  CreateUserAccountDependencies,
  CreateUserAccountResult,
} from './create-user-account';

export { signUp } from './sign-up';
export type { SignUpInput, SignUpDependencies, SignUpResult } from './sign-up';

export { logIn } from './log-in';
export type { LogInInput, LogInDependencies, LogInResult } from './log-in';

export { createInviteToken, verifyInviteToken } from './invite-token';
export type { InviteTokenPayload } from './invite-token';

export { inviteTeammate } from './invite-teammate';
export type {
  InviteTeammateInput,
  InviteTeammateDependencies,
  InviteTeammateResult,
} from './invite-teammate';

export { acceptInvite } from './accept-invite';
export type {
  AcceptInviteInput,
  AcceptInviteDependencies,
  AcceptInviteResult,
} from './accept-invite';

export { InMemoryRateLimiter } from './rate-limiter';
export type { RateLimiter } from './rate-limiter';
