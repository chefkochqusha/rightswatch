import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, statfs } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";

/**
 * Short-lived storage for uploaded files on the server's own disk
 * (`UPLOAD_DIR`, a Docker volume). A file lives here only until the job
 * that needs it is done — fingerprinting a song, checking a post's audio —
 * and is deleted then; `sweep` removes anything a crashed job left behind.
 * Nothing here is served back to a browser.
 */

export class UploadTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    this.name = "UploadTooLargeError";
  }
}

export interface StoredUpload {
  /** Random, opaque; never derived from the uploader's file name. */
  key: string;
  size: number;
  sha256: string;
  /** The first bytes, to tell the file type by content. */
  head: Uint8Array;
}

const KEY = /^[0-9a-f-]{36}$/;
const HEAD_BYTES = 64;

export class UploadStore {
  constructor(private readonly root: string) {}

  /** Streams to disk, stopping (and deleting the partial file) past `maxBytes`. */
  async save(source: Readable | ReadableStream<Uint8Array>, maxBytes: number): Promise<StoredUpload> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const key = randomUUID();
    const file = this.pathFor(key);
    const hash = createHash("sha256");
    let size = 0;
    const head: number[] = [];
    const meter = new Transform({
      transform(chunk: Buffer, _enc, done) {
        size += chunk.length;
        if (size > maxBytes) return done(new UploadTooLargeError(maxBytes));
        if (head.length < HEAD_BYTES) head.push(...chunk.subarray(0, HEAD_BYTES - head.length));
        hash.update(chunk);
        done(null, chunk);
      },
    });
    const input = source instanceof Readable ? source : Readable.fromWeb(source as WebReadableStream<Uint8Array>);
    try {
      await pipeline(input, meter, createWriteStream(file, { mode: 0o600, flags: "wx" }));
    } catch (error) {
      await rm(file, { force: true });
      throw error;
    }
    return { key, size, sha256: hash.digest("hex"), head: Uint8Array.from(head) };
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  /** Bytes held by stored uploads, and bytes still free on the disk. */
  async usage(): Promise<{ usedBytes: number; freeBytes: number }> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    let usedBytes = 0;
    for (const name of await readdir(this.root)) {
      if (!KEY.test(name)) continue;
      const info = await stat(path.join(this.root, name)).catch(() => null);
      usedBytes += info?.size ?? 0;
    }
    const fs = await statfs(this.root);
    return { usedBytes, freeBytes: Number(fs.bavail) * Number(fs.bsize) };
  }

  /** Deletes files older than `maxAgeMs`; returns how many. */
  async sweep(maxAgeMs: number, now: number = Date.now()): Promise<number> {
    let names: string[];
    try {
      names = await readdir(this.root);
    } catch {
      return 0;
    }
    let removed = 0;
    for (const name of names) {
      if (!KEY.test(name)) continue;
      const file = path.join(this.root, name);
      const info = await stat(file).catch(() => null);
      if (info && now - info.mtimeMs > maxAgeMs) {
        await rm(file, { force: true });
        removed += 1;
      }
    }
    return removed;
  }

  private pathFor(key: string): string {
    if (!KEY.test(key)) throw new Error("Bad upload key.");
    return path.join(this.root, key);
  }
}
