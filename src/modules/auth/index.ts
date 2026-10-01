export { hashPassword, verifyPassword, needsRehash, simulatePasswordCheck } from "./password";
export { createSessionToken, verifySessionToken } from "./session";
export type { SessionPayload } from "./session";
export {
  startSession,
  resolveSession,
  endSession,
  hashSessionId,
  SESSION_DURATION_MS,
} from "./session-lifecycle";
export type { SessionLifecycleDependencies } from "./session-lifecycle";
export { deriveKey } from "./derive-key";
export { requestPasswordReset, resetPassword } from "./password-reset";
export { changePassword } from "./change-password";
export { sendEmailVerification, verifyEmail } from "./email-verification";
export type { SendVerificationResult, VerifyEmailResult } from "./email-verification";
export type { ChangePasswordResult } from "./change-password";
export type { ResetPasswordResult } from "./password-reset";
export { PASSWORD_RESET_TTL_MS } from "./password-reset-token";
export { UniqueConstraintError } from "./errors";

export type {
  Role,
  UserRecord,
  WorkspaceRecord,
  MembershipRecord,
  SessionRecord,
  NewAccount,
  UserRepository,
  WorkspaceRepository,
  MembershipRepository,
  AccountRepository,
  SessionRepository,
} from "./types";

export { slugify, generateUniqueSlug } from "./slug";

export {
  InMemoryUserRepository,
  InMemoryWorkspaceRepository,
  InMemoryMembershipRepository,
  InMemoryAccountRepository,
  InMemorySessionRepository,
} from "./in-memory-repositories";

// The `Prisma*Repository` classes are deliberately NOT re-exported here:
// they transitively import `@/lib/prisma-client`, and this barrel is used by
// every in-memory-only consumer (including every test in this module).
// Import them directly from "@/modules/auth/prisma-repositories" — as
// `app/_lib/auth-store.ts` does.

export { prepareUserAccount, EMAIL_PATTERN, MIN_PASSWORD_LENGTH } from "./prepare-user-account";
export type {
  PrepareUserAccountInput,
  PrepareUserAccountDependencies,
  PrepareUserAccountResult,
} from "./prepare-user-account";

export { signUp } from "./sign-up";
export type { SignUpInput, SignUpDependencies, SignUpResult } from "./sign-up";

export { logIn } from "./log-in";
export type { LogInInput, LogInDependencies, LogInResult } from "./log-in";

export { createInviteToken, verifyInviteToken, INVITABLE_ROLES } from "./invite-token";
export type { InviteTokenPayload } from "./invite-token";

export { inviteTeammate } from "./invite-teammate";
export type {
  InviteTeammateInput,
  InviteTeammateDependencies,
  InviteTeammateResult,
} from "./invite-teammate";

export { acceptInvite } from "./accept-invite";
export type {
  AcceptInviteInput,
  AcceptInviteDependencies,
  AcceptInviteResult,
} from "./accept-invite";

export { InMemoryRateLimiter } from "./rate-limiter";
export type { RateLimiter, RateLimiterOptions } from "./rate-limiter";
