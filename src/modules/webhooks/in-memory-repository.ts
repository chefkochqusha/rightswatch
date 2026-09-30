import type { WebhookEventRecord, WebhookEventRepository, WebhookSource } from "./types";

let webhookEventSequence = 0;

export class InMemoryWebhookEventRepository implements WebhookEventRepository {
  private readonly byId = new Map<string, WebhookEventRecord>();
  private readonly idByKey = new Map<string, string>();

  async record(input: {
    source: WebhookSource;
    externalId: string;
    payload: Record<string, unknown>;
  }): Promise<{ event: WebhookEventRecord; created: boolean }> {
    // Mirrors the schema's @@unique([source, externalId]).
    const key = `${input.source}\u0000${input.externalId}`;
    const existingId = this.idByKey.get(key);
    if (existingId) {
      return { event: this.byId.get(existingId)!, created: false };
    }

    webhookEventSequence += 1;
    const event: WebhookEventRecord = {
      id: `webhook-event-${webhookEventSequence}`,
      source: input.source,
      externalId: input.externalId,
      payload: { ...input.payload },
      processedAt: null,
      createdAt: new Date(),
    };
    this.byId.set(event.id, event);
    this.idByKey.set(key, event.id);
    return { event, created: true };
  }

  async markProcessed(id: string, processedAt: Date): Promise<WebhookEventRecord> {
    const existing = this.byId.get(id);
    if (!existing) {
      throw new Error(`Webhook event ${id} does not exist.`);
    }
    const updated: WebhookEventRecord = { ...existing, processedAt };
    this.byId.set(id, updated);
    return updated;
  }
}
