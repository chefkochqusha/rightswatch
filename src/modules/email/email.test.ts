import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { OutboxEmailSender } from "./outbox";
import { ResendEmailSender } from "./resend";

describe("email senders", () => {
  test("the outbox keeps the newest messages first and caps itself", async () => {
    const outbox = new OutboxEmailSender();
    for (let i = 0; i < 30; i++) await outbox.send({ to: `a${i}@x.test`, subject: "s", text: "t" });
    const kept = outbox.messages();
    assert.equal(kept.length, 25);
    assert.equal(kept[0].to, "a29@x.test");
  });

  test("Resend gets a bearer key and the message in its documented shape", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const sender = new ResendEmailSender({
      apiKey: "re_test",
      from: "Bekvor <no-reply@example.test>",
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen = { url, init };
        return new Response('{"id":"1"}', { status: 200 });
      }) as unknown as typeof fetch,
    });
    await sender.send({ to: "nina@northstar.test", subject: "Hello", text: "Body" });
    assert.ok(seen);
    const { url, init } = seen as { url: string; init: RequestInit };
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal((init.headers as Record<string, string>).Authorization, "Bearer re_test");
    assert.deepEqual(JSON.parse(String(init.body)), { from: "Bekvor <no-reply@example.test>", to: ["nina@northstar.test"], subject: "Hello", text: "Body" });
  });

  test("a refusal throws without echoing the key", async () => {
    const sender = new ResendEmailSender({
      apiKey: "re_secret_key",
      from: "a@b.test",
      fetchImpl: (async () => new Response("domain not verified", { status: 403 })) as unknown as typeof fetch,
    });
    await assert.rejects(sender.send({ to: "x@y.test", subject: "s", text: "t" }), (error: Error) => {
      assert.match(error.message, /403/);
      assert.ok(!error.message.includes("re_secret_key"));
      return true;
    });
  });
});

describe("SMTP sender", () => {
  test("sends from the configured address through the transport", async () => {
    const { SmtpEmailSender } = await import("./smtp");
    const sent: unknown[] = [];
    const sender = new SmtpEmailSender(
      { host: "smtp.example.eu", port: 587, user: "u", password: "p", from: "Bekvor <hello@bekvor.com>" },
      () => ({ sendMail: async (m) => { sent.push(m); return {}; } }),
    );
    await sender.send({ to: "a@example.com", subject: "Hi", text: "Body" });
    assert.equal(sender.mode, "SMTP");
    assert.deepEqual(sent, [{ from: "Bekvor <hello@bekvor.com>", to: "a@example.com", subject: "Hi", text: "Body" }]);
  });

  test("says when the mail server refuses, without the password", async () => {
    const { SmtpEmailSender } = await import("./smtp");
    const sender = new SmtpEmailSender(
      { host: "smtp.example.eu", port: 587, user: "u", password: "secret-pass", from: "x@bekvor.com" },
      () => ({ sendMail: async () => { throw new Error("535 Authentication failed"); } }),
    );
    await assert.rejects(sender.send({ to: "a@example.com", subject: "s", text: "t" }), (e: Error) => /535/.test(e.message) && !/secret-pass/.test(e.message));
  });

  test("reads its settings from the environment, only when complete", async () => {
    const { smtpSettingsFromEnv } = await import("./smtp");
    assert.equal(smtpSettingsFromEnv({ SMTP_HOST: "smtp.example.eu" }), null, "no sender address");
    assert.equal(smtpSettingsFromEnv({ SMTP_HOST: "h", EMAIL_FROM: "x@y", SMTP_PORT: "99999" }), null);
    assert.deepEqual(smtpSettingsFromEnv({ SMTP_HOST: " h ", EMAIL_FROM: "x@y", SMTP_USER: "u", SMTP_PASSWORD: "p" }), {
      host: "h", port: 587, user: "u", password: "p", from: "x@y",
    });
  });
});

describe("email texts", () => {
  test("invite names who, where, as what, and the link", async () => {
    const { inviteEmail } = await import("./templates");
    const m = inviteEmail({ to: "a@x.com", workspaceName: "Northstar", inviterName: "Lena", roleLabel: "Analyst", link: "https://bekvor.com/invite/accept?token=t" });
    assert.equal(m.subject, "Lena invited you to Northstar on Bekvor");
    assert.match(m.text, /as Analyst/);
    assert.match(m.text, /invite\/accept\?token=t/);
  });

  test("new cases: count in the subject, at most ten listed, a way to turn it off, no legal claim", async () => {
    const { newCasesEmail } = await import("./templates");
    const cases = Array.from({ length: 12 }, (_, i) => ({ creatorUsername: `c${i}`, verdict: "Potential mismatch", link: `https://b/i/${i}` }));
    const m = newCasesEmail({ to: "a@x.com", workspaceName: "W", cases, casesLink: "https://b/cases", settingsLink: "https://b/settings" });
    assert.equal(m.subject, "12 new cases in W");
    assert.match(m.text, /and 2 more/);
    assert.doesNotMatch(m.text, /c10/);
    assert.match(m.text, /Turn these emails off in Settings: https:\/\/b\/settings/);
    assert.match(m.text, /not a legal finding/);
    assert.doesNotMatch(m.text, /infring/i);
    assert.equal(newCasesEmail({ to: "a", workspaceName: "W", cases: cases.slice(0, 1), casesLink: "x", settingsLink: "y" }).subject, "1 new case in W");
  });

  test("account exists: login and reset links, nothing changed", async () => {
    const { accountExistsEmail } = await import("./templates");
    const m = accountExistsEmail({ to: "a@x.com", loginLink: "https://b/login", resetLink: "https://b/forgot-password" });
    assert.match(m.text, /https:\/\/b\/login/);
    assert.match(m.text, /Nothing about your account changed/);
  });
});
