export type { WebhookSource, WebhookEventRecord, WebhookEventRepository } from "./types";

export { InMemoryWebhookEventRepository } from "./in-memory-repository";

// `PrismaWebhookEventRepository` is deliberately NOT re-exported here — same
// reasoning as `modules/audit/index.ts`: it transitively imports
// `@/lib/prisma-client`. Import it directly from
// "@/modules/webhooks/prisma-repository".
