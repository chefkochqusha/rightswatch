import { randomUUID } from "node:crypto";
import type {
  MembershipRecord,
  MembershipRepository,
  Role,
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

  async create(input: {
    email: string;
    passwordHash: string;
    name: string | null;
  }): Promise<UserRecord> {
    const now = new Date();
    const user: UserRecord = {
      id: randomUUID(),
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      name: input.name,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(user.id, user);
    return user;
  }
}

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  private readonly byId = new Map<string, WorkspaceRecord>();

  async findBySlug(slug: string): Promise<WorkspaceRecord | null> {
    for (const workspace of this.byId.values()) {
      if (workspace.slug === slug) return workspace;
    }
    return null;
  }

  async findById(id: string): Promise<WorkspaceRecord | null> {
    return this.byId.get(id) ?? null;
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
