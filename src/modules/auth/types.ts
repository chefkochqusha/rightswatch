/**
 * Identity & tenancy domain types (Brief §43 "Database entities": User,
 * Workspace, Membership; Brief §40 tech stack calls for session-based auth
 * with roles OWNER/ADMIN/ANALYST/VIEWER). Field names mirror
 * `prisma/schema.prisma`'s `User`, `Workspace` and `Membership` models
 * exactly, so a Prisma-backed repository is a drop-in replacement for the
 * in-memory one in `in-memory-repositories.ts` — the same pattern already
 * used for `PlatformConnector` (mock vs. real TikTok) and `RightsRepository`
 * (fixture vs. real DB): business logic (`sign-up.ts`, `log-in.ts`) depends
 * only on these interfaces, never on a concrete storage technology.
 */

export type Role = "OWNER" | "ADMIN" | "ANALYST" | "VIEWER";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MembershipRecord {
  id: string;
  userId: string;
  workspaceId: string;
  role: Role;
  createdAt: Date;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: NewAccount): Promise<UserRecord>;
  /** Re-stores a password at the current hashing cost after a successful
   *  login (`password.ts`'s `needsRehash`). */
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
}

/** A validated, already-hashed new account — what `prepareUserAccount`
 *  produces and `AccountRepository.createAccount` writes. */
export interface NewAccount {
  email: string;
  passwordHash: string;
  name: string | null;
}

/**
 * Creating an account is one write, not three. A user, their membership and
 * (for signup) their new workspace are created together or not at all:
 * written separately, a failure between steps left a user with no
 * membership, who could neither reach a workspace nor sign up again with
 * that email (raised by an independent security review).
 */
export interface AccountRepository {
  /** Throws `UniqueConstraintError` (`errors.ts`) on a duplicate email or
   *  workspace slug; nothing is written in that case. */
  createAccount(input: {
    user: NewAccount;
    role: Role;
    workspace: { existingId: string } | { newName: string; newSlug: string };
  }): Promise<{ user: UserRecord; workspace: WorkspaceRecord; membership: MembershipRecord }>;
}

/** Mirrors the `Session` model in `prisma/schema.prisma`. `id` is the SHA-256
 *  of the random session id carried in the cookie (`session-lifecycle.ts`). */
export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface SessionRepository {
  create(input: { id: string; userId: string; expiresAt: Date }): Promise<SessionRecord>;
  findById(id: string): Promise<SessionRecord | null>;
  /** A no-op when there's no such row — logging out twice isn't an error. */
  delete(id: string): Promise<void>;
  /** Housekeeping at each login, so a user's expired rows don't pile up. */
  deleteExpiredForUser(userId: string, now: Date): Promise<void>;
}

export interface WorkspaceRepository {
  findBySlug(slug: string): Promise<WorkspaceRecord | null>;
  findById(id: string): Promise<WorkspaceRecord | null>;
  create(input: { name: string; slug: string }): Promise<WorkspaceRecord>;
}

export interface MembershipRepository {
  create(input: {
    userId: string;
    workspaceId: string;
    role: Role;
  }): Promise<MembershipRecord>;
  findForUser(userId: string): Promise<MembershipRecord[]>;
  findForUserAndWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<MembershipRecord | null>;
  /** All memberships on a workspace — the member list for `/workspace/team`. */
  findForWorkspace(workspaceId: string): Promise<MembershipRecord[]>;
}
