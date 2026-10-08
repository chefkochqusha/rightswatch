import { randomUUID } from "node:crypto";
import { UniqueConstraintError } from "./errors";
import type {
  AccountRepository,
  MembershipRecord,
  MembershipRepository,
  NewAccount,
  Role,
  SessionRecord,
  SessionRepository,
  UserRecord,
  UserRepository,
  WorkspaceRecord,
  WorkspaceRepository,
} from "./types";

/**
 * Process-memory stand-ins for the Prisma-backed repositories Phase 4 will
 * eventually provide (ARCHITECTURE.md "Open decisions": Prisma is chosen,
 * but `prisma generate` cannot run in the current build sandbox — see
 * `prisma/schema.prisma`'s generator block). They exist so Phase 5 (this
 * module) and its UI can be built, tested and demoed end-to-end now rather
 * than waiting: every method matches the repository interfaces in
 * `types.ts` exactly, so a `PrismaUserRepository` etc. is a drop-in
 * replacement later with no change to `sign-up.ts`/`log-in.ts` or the
 * pages that call them.
 *
 * NOT for production use: each instance's data lives only in that
 * instance's memory, lost the moment it's garbage collected — deliberately
 * unlike `FixtureRightsRepository` and friends (which reset to the same
 * fixtures every time, by design, for the public Demo Mode pages). The
 * app wires up exactly one long-lived instance of each — see
 * `app/_lib/auth-store.ts` — so accounts survive across requests within a
 * server process, but never across a restart or redeploy, and never across
 * serverless instances.
 */

export class InMemoryUserRepository implements UserRepository {
  private readonly byId = new Map<string, UserRecord>();

  async delete(id: string): Promise<void> {
    this.byId.delete(id);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const normalized = email.toLowerCase();
    for (const user of this.byId.values()) {
      if (user.email === normalized) return user;
    }
    return null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.byId.get(id) ?? null;
  }

  async create(input: NewAccount): Promise<UserRecord> {
    const now = new Date();
    const user: UserRecord = {
      id: randomUUID(),
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      name: input.name,
      emailVerifiedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(user.id, user);
    return user;
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    const user = this.byId.get(id);
    if (user) this.byId.set(id, { ...user, passwordHash, updatedAt: new Date() });
  }

  async markEmailVerified(id: string, at: Date): Promise<void> {
    const user = this.byId.get(id);
    if (user && !user.emailVerifiedAt) this.byId.set(id, { ...user, emailVerifiedAt: at, updatedAt: new Date() });
  }
}

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  private readonly byId = new Map<string, WorkspaceRecord>();

  async delete(id: string): Promise<void> {
    this.byId.delete(id);
  }

  async findBySlug(slug: string): Promise<WorkspaceRecord | null> {
    for (const workspace of this.byId.values()) {
      if (workspace.slug === slug) return workspace;
    }
    return null;
  }

  async findById(id: string): Promise<WorkspaceRecord | null> {
    return this.byId.get(id) ?? null;
  }

  async findAll(): Promise<WorkspaceRecord[]> {
    return [...this.byId.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async create(input: { name: string; slug: string }): Promise<WorkspaceRecord> {
    const now = new Date();
    const workspace: WorkspaceRecord = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(workspace.id, workspace);
    return workspace;
  }
}

export class InMemoryMembershipRepository implements MembershipRepository {
  private readonly byId = new Map<string, MembershipRecord>();

  async deleteForWorkspace(workspaceId: string): Promise<void> {
    for (const [id, membership] of this.byId) {
      if (membership.workspaceId === workspaceId) this.byId.delete(id);
    }
  }

  async deleteForUser(userId: string): Promise<void> {
    for (const [id, membership] of this.byId) {
      if (membership.userId === userId) this.byId.delete(id);
    }
  }

  async create(input: {
    userId: string;
    workspaceId: string;
    role: Role;
  }): Promise<MembershipRecord> {
    const membership: MembershipRecord = {
      id: randomUUID(),
      userId: input.userId,
      workspaceId: input.workspaceId,
      role: input.role,
      createdAt: new Date(),
    };
    this.byId.set(membership.id, membership);
    return membership;
  }

  async findForUser(userId: string): Promise<MembershipRecord[]> {
    return Array.from(this.byId.values()).filter((m) => m.userId === userId);
  }

  async findForUserAndWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<MembershipRecord | null> {
    for (const membership of this.byId.values()) {
      if (membership.userId === userId && membership.workspaceId === workspaceId) {
        return membership;
      }
    }
    return null;
  }

  async findForWorkspace(workspaceId: string): Promise<MembershipRecord[]> {
    return Array.from(this.byId.values()).filter((m) => m.workspaceId === workspaceId);
  }
}

/**
 * Writes through the three repositories above. Every check happens before
 * any write, so a rejected call leaves nothing behind — the in-memory
 * equivalent of the Prisma version's single nested (atomic) write, including
 * its failures: a duplicate email or slug throws `UniqueConstraintError`,
 * and joining a workspace that doesn't exist throws, as Prisma's `connect`
 * does.
 */
export class InMemoryAccountRepository implements AccountRepository {
  constructor(
    private readonly users: InMemoryUserRepository,
    private readonly workspaces: InMemoryWorkspaceRepository,
    private readonly memberships: InMemoryMembershipRepository,
  ) {}

  async createAccount(input: {
    user: NewAccount;
    role: Role;
    workspace: { existingId: string } | { newName: string; newSlug: string };
  }): Promise<{ user: UserRecord; workspace: WorkspaceRecord; membership: MembershipRecord }> {
    if (await this.users.findByEmail(input.user.email)) {
      throw new UniqueConstraintError("email");
    }

    let existing: WorkspaceRecord | null = null;
    if ("existingId" in input.workspace) {
      existing = await this.workspaces.findById(input.workspace.existingId);
      if (!existing) throw new Error(`Workspace ${input.workspace.existingId} does not exist.`);
    } else if (await this.workspaces.findBySlug(input.workspace.newSlug)) {
      throw new UniqueConstraintError("slug");
    }

    const user = await this.users.create(input.user);
    const workspace =
      existing ??
      ("newName" in input.workspace
        ? await this.workspaces.create({ name: input.workspace.newName, slug: input.workspace.newSlug })
        : null);
    if (!workspace) throw new Error("Unreachable: no workspace to join or create.");

    const membership = await this.memberships.create({
      userId: user.id,
      workspaceId: workspace.id,
      role: input.role,
    });
    return { user, workspace, membership };
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    const members = await this.memberships.findForWorkspace(workspaceId);
    await this.memberships.deleteForWorkspace(workspaceId);
    await this.workspaces.delete(workspaceId);
    for (const { userId } of members) {
      if ((await this.memberships.findForUser(userId)).length === 0) await this.users.delete(userId);
    }
  }

  async deleteUser(userId: string): Promise<void> {
    await this.memberships.deleteForUser(userId);
    await this.users.delete(userId);
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly byId = new Map<string, SessionRecord>();

  async create(input: { id: string; userId: string; expiresAt: Date }): Promise<SessionRecord> {
    const session: SessionRecord = { ...input, createdAt: new Date() };
    this.byId.set(session.id, session);
    return session;
  }

  async findById(id: string): Promise<SessionRecord | null> {
    return this.byId.get(id) ?? null;
  }

  async delete(id: string): Promise<void> {
    this.byId.delete(id);
  }

  async deleteAllForUser(userId: string): Promise<void> {
    for (const [id, session] of this.byId) {
      if (session.userId === userId) this.byId.delete(id);
    }
  }

  async deleteExpiredForUser(userId: string, now: Date): Promise<void> {
    for (const [id, session] of this.byId) {
      if (session.userId === userId && session.expiresAt.getTime() <= now.getTime()) this.byId.delete(id);
    }
  }
}
