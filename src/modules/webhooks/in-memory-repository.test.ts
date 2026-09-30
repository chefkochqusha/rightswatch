import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { InMemoryWebhookEventRepository } from "./in-memory-repository";

describe("InMemoryWebhookEventRepository", () => {
  test("records a new delivery, unprocessed", async () => {
    const repo = new InMemoryWebhookEventRepository();
    const { event, created } = await repo.record({
      source: "stripe",
      externalId: "evt_1",
      payload: { type: "customer.subscription.updated" },
    });
    assert.equal(created, true);
    assert.equal(event.externalId, "evt_1");
    assert.equal(event.processedAt, null);
  });

  test("a re-delivery of the same (source, externalId) returns the existing record, never a duplicate", async () => {
    const repo = new InMemoryWebhookEventRepository();
    const first = await repo.record({ source: "stripe", externalId: "evt_1", payload: { a: 1 } });
    const second = await repo.record({ source: "stripe", externalId: "evt_1", payload: { a: 2 } });
    assert.equal(second.created, false);
    assert.equal(second.event.id, first.event.id);
    assert.deepEqual(second.event.payload, { a: 1 }, "the original record is returned untouched");
  });

  test("the same externalId from a different source is a different event", async () => {
    const repo = new InMemoryWebhookEventRepository();
    const stripe = await repo.record({ source: "stripe", externalId: "evt_1", payload: {} });
    const tiktok = await repo.record({ source: "tiktok", externalId: "evt_1", payload: {} });
    assert.equal(tiktok.created, true);
    assert.notEqual(tiktok.event.id, stripe.event.id);
  });

  test("markProcessed stamps the record, and a later re-delivery sees it as processed", async () => {
    const repo = new InMemoryWebhookEventRepository();
    const { event } = await repo.record({ source: "stripe", externalId: "evt_1", payload: {} });
    const processedAt = new Date("2026-09-30T20:00:00Z");
    await repo.markProcessed(event.id, processedAt);

    const redelivered = await repo.record({ source: "stripe", externalId: "evt_1", payload: {} });
    assert.equal(redelivered.created, false);
    assert.deepEqual(redelivered.event.processedAt, processedAt);
  });

  test("markProcessed throws for an unknown id", async () => {
    const repo = new InMemoryWebhookEventRepository();
    await assert.rejects(() => repo.markProcessed("no-such-event", new Date()));
  });
});
