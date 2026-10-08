import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryReferralRepository } from "./in-memory-repository";
import { commissionCents, commissionUntil, generatePartnerCode, joinPartnerProgramme, normalizePartnerCode, recordCommission, recordReferral, summarizeCommissions } from "./programme";

describe("partner codes", () => {
  test("eight unambiguous characters, and only such codes are accepted", () => {
    const code = generatePartnerCode();
    assert.match(code, /^[a-hjkmnp-z2-9]{8}$/);
    assert.equal(normalizePartnerCode(` ${code.toUpperCase()} `), code);
    for (const bad of ["", "short", "abcdefgh1", "abcdefgo", "abc def!", 42, null]) assert.equal(normalizePartnerCode(bad), null, String(bad));
  });
});

describe("commission maths", () => {
  test("10 % of the invoice, rounded down; nothing for nothing", () => {
    assert.equal(commissionCents(29_900), 2_990);
    assert.equal(commissionCents(20_935), 2_093);
    assert.equal(commissionCents(0), 0);
    assert.equal(commissionCents(-5), 0);
  });
  test("the window is 12 months", () => {
    assert.equal(commissionUntil(new Date("2026-10-08T12:00:00Z")).toISOString(), "2027-10-08T12:00:00.000Z");
  });
});

describe("programme flow", () => {
  test("joining needs the terms, and is idempotent", async () => {
    const referrals = new InMemoryReferralRepository();
    assert.deepEqual(await joinPartnerProgramme({ userId: "u1", acceptedTerms: false }, { referrals }), { ok: false, error: "TERMS_NOT_ACCEPTED" });
    const first = await joinPartnerProgramme({ userId: "u1", acceptedTerms: true }, { referrals });
    const again = await joinPartnerProgramme({ userId: "u1", acceptedTerms: false }, { referrals });
    assert.ok(first.ok && again.ok && first.partner.id === again.partner.id);
  });

  test("a taken code is retried with a new one", async () => {
    const referrals = new InMemoryReferralRepository();
    const codes = ["aaaaaaaa", "aaaaaaaa", "bbbbbbbb"];
    await joinPartnerProgramme({ userId: "u1", acceptedTerms: true }, { referrals, generateCode: () => codes.shift()! });
    const second = await joinPartnerProgramme({ userId: "u2", acceptedTerms: true }, { referrals, generateCode: () => codes.shift()! });
    assert.ok(second.ok && second.partner.code === "bbbbbbbb");
  });

  test("referral: unknown code, self-referral and double referral are refused", async () => {
    const referrals = new InMemoryReferralRepository();
    const joined = await joinPartnerProgramme({ userId: "partner", acceptedTerms: true }, { referrals });
    assert.ok(joined.ok);
    if (!joined.ok) return;
    const code = joined.partner.code;
    assert.deepEqual(await recordReferral({ code: undefined, workspaceId: "w0", signupUserId: "x" }, { referrals }), { ok: false, reason: "NO_CODE" });
    assert.deepEqual(await recordReferral({ code: "zzzzzzzz", workspaceId: "w0", signupUserId: "x" }, { referrals }), { ok: false, reason: "UNKNOWN_CODE" });
    assert.deepEqual(await recordReferral({ code, workspaceId: "w0", signupUserId: "partner" }, { referrals }), { ok: false, reason: "SELF_REFERRAL" });
    const ok = await recordReferral({ code, workspaceId: "w1", signupUserId: "newbie", now: new Date("2026-10-08Z") }, { referrals });
    assert.ok(ok.ok);
    assert.deepEqual(await recordReferral({ code, workspaceId: "w1", signupUserId: "newbie" }, { referrals }), { ok: false, reason: "ALREADY_REFERRED" });
  });

  test("commissions: inside the window once per invoice, nothing outside it or for others", async () => {
    const referrals = new InMemoryReferralRepository();
    const joined = await joinPartnerProgramme({ userId: "partner", acceptedTerms: true }, { referrals });
    assert.ok(joined.ok);
    if (!joined.ok) return;
    await recordReferral({ code: joined.partner.code, workspaceId: "w1", signupUserId: "n", now: new Date("2026-10-08Z") }, { referrals });
    const deps = { referrals };
    assert.equal(await recordCommission({ workspaceId: "w1", invoiceId: "in_1", invoiceCents: 29_900, paidAt: new Date("2026-11-01Z") }, deps), "created");
    assert.equal(await recordCommission({ workspaceId: "w1", invoiceId: "in_1", invoiceCents: 29_900, paidAt: new Date("2026-11-01Z") }, deps), "duplicate");
    assert.equal(await recordCommission({ workspaceId: "w1", invoiceId: "in_2", invoiceCents: 29_900, paidAt: new Date("2027-11-01Z") }, deps), "outside_window");
    assert.equal(await recordCommission({ workspaceId: "w9", invoiceId: "in_3", invoiceCents: 29_900, paidAt: new Date("2026-11-01Z") }, deps), "not_referred");
    assert.equal(await recordCommission({ workspaceId: "w1", invoiceId: "in_4", invoiceCents: 0, paidAt: new Date("2026-11-01Z") }, deps), "zero");
    const rows = await referrals.findCommissionsForPartner(joined.partner.id);
    assert.deepEqual(summarizeCommissions(rows), { earnedCents: 2_990, paidOutCents: 0, openCents: 2_990 });
  });
});
