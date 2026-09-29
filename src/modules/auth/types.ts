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
  create(input: {
    email: string;
    passwordHash: string;
    name: string | null;
  }): Promise<UserRecord>;
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
