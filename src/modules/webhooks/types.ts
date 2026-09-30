/**
 * Durable record of one inbound webhook delivery — the schema's
 * `WebhookEvent` (Master Brief §22 idempotency: "the same principle applies
 * to ... webhook events"; §60 "billing webhook logs"). `(source,
 * externalId)` is unique in the schema, so a re-delivered event is
 * recognized as the one already on file instead of being processed twice.
 *
 * Its own module rather than part of `billing`: the table is shared by
 * every webhook source (`"stripe"` today, TikTok once Phase 10 exists), the
 * same way `audit` is shared by every domain that writes audit entries.
 */
export type WebhookSource = "stripe" | "tiktok";

export interface WebhookEventRecord {
  id: string;
  source: WebhookSource;
  /** The provider's own event id (Stripe's `evt_…`) — the idempotency key. */
  externalId: string;
  /**
   * Deliberately minimal (Master Brief §59, data minimization): only the
   * handful of fields the handler actually acted on, never the provider's
   * full payload — a Stripe event carries customer emails, names and
   * addresses this app has no reason to keep a second copy of.
   */
  payload: Record<string, unknown>;
  /** `null` until the handler finishes. A failed attempt leaves it `null`,
   *  so the provider's retry of the same event is processed, not skipped. */
  processedAt: Date | null;
  createdAt: Date;
}

export interface WebhookEventRepository {
  /**
   * Records a delivery — or, if `(source, externalId)` is already on file,
   * returns that existing record untouched. Never creates a duplicate.
   * `created` says which happened.
   */
  record(input: {
    source: WebhookSource;
    externalId: string;
    payload: Record<string, unknown>;
  }): Promise<{ event: WebhookEventRecord; created: boolean }>;

  markProcessed(id: string, processedAt: Date): Promise<WebhookEventRecord>;
}
