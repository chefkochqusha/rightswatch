import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { UploadStore, UploadTooLargeError } from "./upload-store";

const tempRoot = () => mkdtemp(path.join(tmpdir(), "bekvor-uploads-"));

describe("UploadStore", () => {
  it("stores a stream under a random key, with its size, hash and first bytes", async () => {
    const root = await tempRoot();
    const store = new UploadStore(root);
    const data = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(100_000, 7)]);
    const saved = await store.save(Readable.from([data.subarray(0, 50), data.subarray(50)]), 1_000_000);
    assert.match(saved.key, /^[0-9a-f-]{36}$/);
    assert.equal(saved.size, data.length);
    assert.equal(saved.sha256, createHash("sha256").update(data).digest("hex"));
    assert.equal(Buffer.from(saved.head).subarray(0, 3).toString(), "ID3");
    assert.equal(saved.head.length, 64);
    assert.deepEqual(await store.read(saved.key), data);
    await store.delete(saved.key);
    assert.deepEqual(await readdir(root), []);
  });

  it("accepts a web stream (a request body)", async () => {
    const store = new UploadStore(await tempRoot());
    const saved = await store.save(new Response("hello").body!, 100);
    assert.equal((await store.read(saved.key)).toString(), "hello");
  });

  it("stops at the size limit and leaves nothing behind", async () => {
    const root = await tempRoot();
    const store = new UploadStore(root);
    await assert.rejects(store.save(Readable.from([Buffer.alloc(600), Buffer.alloc(600)]), 1000), UploadTooLargeError);
    assert.deepEqual(await readdir(root), []);
  });

  it("refuses keys that aren't its own", async () => {
    const store = new UploadStore(await tempRoot());
    await assert.rejects(store.read("../../etc/passwd"), /Bad upload key/);
  });

  it("sweeps files older than the limit", async () => {
    const root = await tempRoot();
    const store = new UploadStore(root);
    const old = await store.save(Readable.from([Buffer.from("old")]), 100);
    const fresh = await store.save(Readable.from([Buffer.from("new")]), 100);
    const dayAgo = new Date(Date.now() - 25 * 3600_000);
    await utimes(path.join(root, old.key), dayAgo, dayAgo);
    assert.equal(await store.sweep(24 * 3600_000), 1);
    assert.deepEqual(await readdir(root), [fresh.key]);
  });
});
