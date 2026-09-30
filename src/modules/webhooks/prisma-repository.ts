import { getPrisma } from "@/lib/prisma-client";
import type { Prisma } from "@/generated/prisma/client";
import type { WebhookEventRecord, WebhookEventRepository, WebhookSource } from "./types";

/**
 * Prisma-backed `WebhookEventRepository` — drop-in replacement for
 * `InMemoryWebhookEventRepository`, matching `types.ts`'s interface exactly.
 * Every column this writes is either a plain value or the row's own id —
 * no foreign keys — so unlike `PrismaCaseRepository` this is safe to wire
 * in without anything else being persisted first.
 *
 * `getPrisma()`, not a top-level `prisma` binding — see
 * `src/lib/prisma-client.ts`'s doc comment for why.
 */
export class PrismaWebhookEventRepository implements WebhookEventRepository {
  async record(input: {
    source: WebhookSource;
    externalId: string;
    payload: Record<string, unknown>;
  }): Promise<{ event: WebhookEventRecord; created: boolean }> {
    const where = { source_externalId: { source: input.source, externalId: input.externalId } };

    const existing = await getPrisma().webhookEvent.findUnique({ where });
    if (existing) {
      return { event: mapWebhookEvent(existing), created: false };
    }

    try {
      const row = await getPrisma().webhookEvent.create({
        data: {
          source: input.source,
          externalId: input.externalId,
          // Same representation-bridging cast as `PrismaAuditLogRepository`'s
          // `metadata`: a `Record<string, unknown>` doesn't structurally
          // satisfy Prisma's `InputJsonValue`. Required column, so no
          // `DbNull` branch is needed here.
          payload: input.payload as unknown as Prisma.InputJsonValue,
        },
      });
      return { event: mapWebhookEvent(row), created: true };
    } catch (error) {
      // Two deliveries of the same event racing past the `findUnique`
      // above: the loser hits the (source, externalId) unique constraint
      // (P2002). That's the idempotency guarantee working, not a failure —
      // hand back the winner's row. Duck-typed on `code` rather than an
      // `instanceof` check, which would need a runtime import of the
      // generated client (see `getPrisma()` for why that's avoided).
      if ((error as { code?: string }).code === "P2002") {
        const winner = await getPrisma().webhookEvent.findUnique({ where });
        if (winner) {
          return { event: mapWebhookEvent(winner), created: false };
        }
      }
      throw error;
    }
  }

  async markProcessed(id: string, processedAt: Date): Promise<WebhookEventRecord> {
    const row = await getPrisma().webhookEvent.update({ where: { id }, data: { processedAt } });
    return mapWebhookEvent(row);
  }
}

function mapWebhookEvent(row: {
  id: string;
  source: string;
  externalId: string;
  payload: unknown;
  processedAt: Date | null;
  createdAt: Date;
}): WebhookEventRecord {
  return {
    id: row.id,
    source: row.source as WebhookSource,
    externalId: row.externalId,
    // Only ever written by `record` above, always as a plain object.
    payload: row.payload as Record<string, unknown>,
    processedAt: row.processedAt,
    createdAt: row.createdAt,
  };
}
