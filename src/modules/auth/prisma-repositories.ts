import { getPrisma } from "@/lib/prisma-client";
import type { PrismaClient } from "@/generated/prisma/client";
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
 * Prisma-backed repositories (Phase 2) for `User`, `Workspace` and
 * `Membership` — drop-in replacements for the three in-memory repositories
 * in `in-memory-repositories.ts`, matching `types.ts`'s interfaces exactly.
 * Wired into `app/_lib/auth-store.ts` now that Neon's schema push is live.
 * `InMemoryRateLimiter` has no Prisma equivalent — it stays Redis-bound per
 * the Master Brief, see `auth-store.ts`.
 *
 * `getPrisma()`, not a top-level `prisma` binding — see
 * `src/lib/prisma-client.ts`'s doc comment for why.
 */

// Prisma 7's new "prisma-client" generator (see `prisma/schema.prisma`)
// may represent the schema's `Role` enum as a nominal TS `enum` or as a
// plain string-literal union depending on generator internals — this
// sandbox can't run `prisma generate` to check (its schema-engine binary
// download is blocked here; see `prisma.config.ts`'s history). Deriving
// the expected type straight from the client's own method signature, and
// casting through it, is correct either way: the four literal string
// values already match `types.ts`'s own `Role` and the schema's enum
// exactly, so this is a representation-bridging cast, not a real risk of
// passing the wrong value.
// `typeof getPrisma().membership.create` won't parse — TypeScript's `typeof`
// type operator only accepts a dotted identifier chain, never a call
// expression like `getPrisma()`. Indexing the `PrismaClient` type directly
// (`PrismaClient["membership"]["create"]`) parses fine but was verified
// (empirically, in this sandbox) to behave differently from the old
// `typeof prisma.membership.create`: with the generated client absent here,
// TypeScript's error-recovery for the unresolvable import degrades a plain
// `typeof value.prop.prop` chain silently, but degrades a type-level index
// access into a spurious `Parameters<...>[0]["data"]` "does not exist on
// type 'unknown'" error. A never-initialized `declare const` gives `typeof`
// a plain identifier to walk again, restoring the old, clean behavior.
declare const _phantomPrismaClient: PrismaClient;
type PrismaRole = Parameters<typeof _phantomPrismaClient.membership.create>[0]["data"]["role"] & string;
function toPrismaRole(role: Role): PrismaRole {
  return role as PrismaRole;
}
function fromPrismaRole(role: string): Role {
  return role as Role;
}

export class PrismaUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await getPrisma().user.findUnique({ where: { email: email.toLowerCase() } });
    return row ? mapUser(row) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await getPrisma().user.findUnique({ where: { id } });
    return row ? mapUser(row) : null;
  }

  async create(input: NewAccount): Promise<UserRecord> {
    const row = await getPrisma().user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        name: input.name,
      },
    });
    return mapUser(row);
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await getPrisma().user.update({ where: { id }, data: { passwordHash } });
  }

  async markEmailVerified(id: string, at: Date): Promise<void> {
    await getPrisma().user.updateMany({ where: { id, emailVerifiedAt: null }, data: { emailVerifiedAt: at } });
  }
}

/**
 * The user, their membership and (for signup) the new workspace in one
 * nested `user.create` — Prisma runs a nested write as a single
 * transaction, so a failure anywhere (a slug taken a moment ago, a dropped
 * connection) leaves no user behind without a membership.
 */
export class PrismaAccountRepository implements AccountRepository {
  async createAccount(input: {
    user: NewAccount;
    role: Role;
    workspace: { existingId: string } | { newName: string; newSlug: string };
  }): Promise<{ user: UserRecord; workspace: WorkspaceRecord; membership: MembershipRecord }> {
    try {
      const row = await getPrisma().user.create({
        data: {
          email: input.user.email.toLowerCase(),
          passwordHash: input.user.passwordHash,
          name: input.user.name,
          memberships: {
            create: {
              role: toPrismaRole(input.role),
              workspace:
                "existingId" in input.workspace
                  ? { connect: { id: input.workspace.existingId } }
                  : { create: { name: input.workspace.newName, slug: input.workspace.newSlug } },
            },
          },
        },
        include: { memberships: { include: { workspace: true } } },
      });
      const membership = row.memberships[0];
      if (!membership) throw new Error("Account write returned no membership.");
      return {
        user: mapUser(row),
        workspace: mapWorkspace(membership.workspace),
        membership: mapMembership(membership),
      };
    } catch (error) {
      const field = uniqueViolationField(error);
      if (field) throw new UniqueConstraintError(field);
      throw error;
    }
  }
}

export class PrismaSessionRepository implements SessionRepository {
  async create(input: { id: string; userId: string; expiresAt: Date }): Promise<SessionRecord> {
    const row = await getPrisma().session.create({ data: input });
    return mapSession(row);
  }

  async findById(id: string): Promise<SessionRecord | null> {
    const row = await getPrisma().session.findUnique({ where: { id } });
    return row ? mapSession(row) : null;
  }

  async delete(id: string): Promise<void> {
    // `deleteMany`, not `delete`: the latter throws when the row is already
    // gone, and logging out twice (two tabs) isn't an error.
    await getPrisma().session.deleteMany({ where: { id } });
  }

  async deleteExpiredForUser(userId: string, now: Date): Promise<void> {
    await getPrisma().session.deleteMany({ where: { userId, expiresAt: { lte: now } } });
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await getPrisma().session.deleteMany({ where: { userId } });
  }
}

/**
 * Prisma reports a unique-constraint violation as error code P2002. Which
 * constraint it was is read from the error's metadata as text rather than a
 * fixed path, since its shape differs between Prisma's query engine and its
 * driver adapters — `signUp` re-checks the email anyway when this can't say.
 */
function uniqueViolationField(error: unknown): "email" | "slug" | "unknown" | null {
  if (typeof error !== "object" || error === null) return null;
  if ((error as { code?: unknown }).code !== "P2002") return null;
  const meta = JSON.stringify((error as { meta?: unknown }).meta ?? {});
  if (meta.includes("email")) return "email";
  if (meta.includes("slug")) return "slug";
  return "unknown";
}

export class PrismaWorkspaceRepository implements WorkspaceRepository {
  async findBySlug(slug: string): Promise<WorkspaceRecord | null> {
    const row = await getPrisma().workspace.findUnique({ where: { slug } });
    return row ? mapWorkspace(row) : null;
  }

  async findById(id: string): Promise<WorkspaceRecord | null> {
    const row = await getPrisma().workspace.findUnique({ where: { id } });
    return row ? mapWorkspace(row) : null;
  }

  async create(input: { name: string; slug: string }): Promise<WorkspaceRecord> {
    const row = await getPrisma().workspace.create({ data: { name: input.name, slug: input.slug } });
    return mapWorkspace(row);
  }
}

export class PrismaMembershipRepository implements MembershipRepository {
  async create(input: { userId: string; workspaceId: string; role: Role }): Promise<MembershipRecord> {
    const row = await getPrisma().membership.create({
      data: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        role: toPrismaRole(input.role),
      },
    });
    return mapMembership(row);
  }

  async findForUser(userId: string): Promise<MembershipRecord[]> {
    const rows = await getPrisma().membership.findMany({ where: { userId } });
    return rows.map(mapMembership);
  }

  async findForUserAndWorkspace(userId: string, workspaceId: string): Promise<MembershipRecord | null> {
    // `@@unique([userId, workspaceId])` in the schema — Prisma names the
    // compound-unique lookup key by joining the fields in declaration order.
    const row = await getPrisma().membership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    return row ? mapMembership(row) : null;
  }

  async findForWorkspace(workspaceId: string): Promise<MembershipRecord[]> {
    const rows = await getPrisma().membership.findMany({ where: { workspaceId } });
    return rows.map(mapMembership);
  }
}

function mapUser(row: {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    name: row.name,
    emailVerifiedAt: row.emailVerifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapWorkspace(row: {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}): WorkspaceRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMembership(row: {
  id: string;
  userId: string;
  workspaceId: string;
  role: string;
  createdAt: Date;
}): MembershipRecord {
  return {
    id: row.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    role: fromPrismaRole(row.role),
    createdAt: row.createdAt,
  };
}

function mapSession(row: { id: string; userId: string; expiresAt: Date; createdAt: Date }): SessionRecord {
  return { id: row.id, userId: row.userId, expiresAt: row.expiresAt, createdAt: row.createdAt };
}
