import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryWaitlistRepository } from "./in-memory-repository";
import { CONFIRMATION_TTL_MS, WAITLIST_CONSENT, confirmWaitlist, hashToken, joinWaitlist, leaveWaitlist } from "./waitlist";

function setup(start = new Date("2026-10-18T12:00:00Z")) {
  const repository = new InMemoryWaitlistRepository();
  const sent: { to: string; confirm: string; leave: string }[] = [];
  let clock = start;
  let n = 0;
  const deps = {
    repository,
    sendConfirmation: async (to: string, links: { confirm: string; leave: string }) => {
      sent.push({ to, ...links });
      return { template: "waitlist-confirm@1" };
    },
    linkFor: (kind: "confirm" | "leave", token: string) => `https://bekvor.test/waitlist/${kind}?token=${token}`,
    now: () => clock,
    newToken: () => `token-${++n}`,
  };
  return { repository, sent, deps, advance: (ms: number) => (clock = new Date(clock.getTime() + ms)) };
}

const ok = { email: " Lena@Example.COM ", company: "  Northside   Records ", consent: true, business: true };

describe("waitlist", () => {
  test("joining stores the proof of consent and sends one confirmation email", async () => {
    const { repository, sent, deps } = setup();
    assert.deepEqual(await joinWaitlist(ok, deps), { ok: true });
    const entry = await repository.findByEmail("lena@example.com");
    assert.ok(entry);
    assert.equal(entry.company, "Northside Records");
    assert.equal(entry.consentText, WAITLIST_CONSENT.text);
    assert.equal(entry.consentVersion, WAITLIST_CONSENT.version);
    assert.equal(entry.confirmationTemplate, "waitlist-confirm@1");
    assert.equal(entry.confirmedAt, null);
    assert.equal(entry.tokenHash, hashToken("token-1"));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].confirm, "https://bekvor.test/waitlist/confirm?token=token-1");
  });

  test("refuses without consent, without the business box, with a bad address or an overlong company", async () => {
    const { deps, sent } = setup();
    assert.deepEqual(await joinWaitlist({ ...ok, consent: false }, deps), { ok: false, error: "CONSENT_REQUIRED" });
    assert.deepEqual(await joinWaitlist({ ...ok, business: false }, deps), { ok: false, error: "BUSINESS_REQUIRED" });
    assert.deepEqual(await joinWaitlist({ ...ok, email: "not-an-address" }, deps), { ok: false, error: "INVALID_EMAIL" });
    assert.deepEqual(await joinWaitlist({ ...ok, company: "x".repeat(121) }, deps), { ok: false, error: "COMPANY_TOO_LONG" });
    assert.equal(sent.length, 0);
  });

  test("the link confirms, works only for 7 days, and the old link dies when a new one is sent", async () => {
    const { deps, advance, repository } = setup();
    await joinWaitlist(ok, deps);
    await joinWaitlist(ok, deps); // asked again before confirming: a fresh link
    assert.deepEqual(await confirmWaitlist("token-1", deps), { ok: false, error: "UNKNOWN_OR_EXPIRED" });
    advance(CONFIRMATION_TTL_MS + 1000);
    assert.deepEqual(await confirmWaitlist("token-2", deps), { ok: false, error: "UNKNOWN_OR_EXPIRED" });

    await joinWaitlist(ok, deps); // the expired entry is purged and a new one made
    assert.equal(repository.entries.size, 1);
    const confirmed = await confirmWaitlist("token-3", deps);
    assert.ok(confirmed.ok && confirmed.entry.confirmedAt);
    assert.equal((await confirmWaitlist("token-3", deps)).ok, true); // idempotent
  });

  test("a confirmed address gets no new email, and the answer doesn't tell", async () => {
    const { deps, sent } = setup();
    await joinWaitlist(ok, deps);
    await confirmWaitlist("token-1", deps);
    assert.deepEqual(await joinWaitlist(ok, deps), { ok: true });
    assert.equal(sent.length, 1);
  });

  test("unconfirmed addresses are deleted after 7 days, confirmed ones stay", async () => {
    const { deps, advance, repository } = setup();
    await joinWaitlist(ok, deps);
    await joinWaitlist({ ...ok, email: "kai@example.com" }, deps);
    await confirmWaitlist("token-2", deps);
    advance(CONFIRMATION_TTL_MS + 1);
    await joinWaitlist({ ...ok, email: "mo@example.com" }, deps);
    assert.deepEqual([...repository.entries.values()].map((e) => e.email).sort(), ["kai@example.com", "mo@example.com"]);
  });

  test("leaving deletes the entry, confirmed or not", async () => {
    const { deps, repository } = setup();
    await joinWaitlist(ok, deps);
    await confirmWaitlist("token-1", deps);
    assert.deepEqual(await leaveWaitlist("token-1", deps), { ok: true });
    assert.equal(repository.entries.size, 0);
    assert.deepEqual(await leaveWaitlist("token-1", deps), { ok: false });
  });
});
