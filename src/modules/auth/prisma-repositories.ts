import { prisma } from "@/lib/prisma-client";
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
 * Prisma-backed repositories (Phase 2) for `User`, `Workspace` and
 * `Membership` — drop-in replacements for the three in-memory repositories
 * in `in-memory-repositories.ts`, matching `types.ts`'s interfaces exactly.
 * Not yet wired into `app/_lib/auth-store.ts`: that swap happens once
 * Neon's initial schema push is confirmed live. `InMemoryRateLimiter` has
 * no Prisma equivalent — it stays Redis-bound per the Master Brief, see
 * `auth-store.ts`.
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
type PrismaRole = Parameters<typeof prisma.membership.create>[0]["data"]["role"] & string;
function toPrismaRole(role: Role): PrismaRole {
  return role as PrismaRole;
}
function fromPrismaRole(role: string): Role {
  return role as Role;
}

export class PrismaUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    return row ? mapUser(row) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await prisma.user.findUnique({ where: { id } });
    return row ? mapUser(row) : null;
  }

  async create(input: {
    email: string;
    passwordHash: string;
    name: string | null;
  }): Promise<UserRecord> {
    const row = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        name: input.name,
      },
    });
    return mapUser(row);
  }
}

export class PrismaWorkspaceRepository implements WorkspaceRepository {
  async findBySlug(slug: string): Promise<WorkspaceRecord | null> {
    const row = await prisma.workspace.findUnique({ where: { slug } });
    return row ? mapWorkspace(row) : null;
  }

  async findById(id: string): Promise<WorkspaceRecord | null> {
    const row = await prisma.workspace.findUnique({ where: { id } });
    return row ? mapWorkspace(row) : null;
  }

  async create(input: { name: string; slug: string }): Promise<WorkspaceRecord> {
    const row = await prisma.workspace.create({ data: { name: input.name, slug: input.slug } });
    return mapWorkspace(row);
  }
}

export class PrismaMembershipRepository implements MembershipRepository {
  async create(input: { userId: string; workspaceId: string; role: Role }): Promise<MembershipRecord> {
    const row = await prisma.membership.create({
      data: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        role: toPrismaRole(input.role),
      },
    });
    return mapMembership(row);
  }

  async findForUser(userId: string): Promise<MembershipRecord[]> {
    const rows = await prisma.membership.findMany({ where: { userId } });
    return rows.map(mapMembership);
  }

  async findForUserAndWorkspace(userId: string, workspaceId: string): Promise<MembershipRecord | null> {
    // `@@unique([userId, workspaceId])` in the schema — Prisma names the
    // compound-unique lookup key by joining the fields in declaration order.
    const row = await prisma.membership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    return row ? mapMembership(row) : null;
  }

  async findForWorkspace(workspaceId: string): Promise<MembershipRecord[]> {
    const rows = await prisma.membership.findMany({ where: { workspaceId } });
    return rows.map(mapMembership);
  }
}

function mapUser(row: {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
}): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    name: row.name,
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
