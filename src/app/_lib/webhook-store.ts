import type { WebhookEventRepository } from "@/modules/webhooks";
import { PrismaWebhookEventRepository } from "@/modules/webhooks/prisma-repository";

/**
 * The shared `WebhookEvent` store (Master Brief §22). Prisma-backed from the
 * start: webhooks arrive at whichever serverless instance Vercel picks, so
 * an idempotency record kept in one instance's memory would let a
 * redelivery to another instance be processed twice — the exact thing the
 * table exists to prevent.
 */
interface WebhookStore {
  events: WebhookEventRepository;
}

const globalForWebhooks = globalThis as unknown as { __rightswatchWebhookStore?: WebhookStore };

export function getWebhookStore(): WebhookStore {
  if (!globalForWebhooks.__rightswatchWebhookStore) {
    globalForWebhooks.__rightswatchWebhookStore = { events: new PrismaWebhookEventRepository() };
  }
  return globalForWebhooks.__rightswatchWebhookStore;
}
