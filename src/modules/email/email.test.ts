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
