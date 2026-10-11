import { createHash } from "node:crypto";
import type { RecognitionFingerprint, RecognitionMatchResult } from "./types";

/**
 * Talks to the recognition service (`services/recognizer/server.py`) on the
 * server's private network. The service keeps nothing: fingerprints live in
 * Postgres, and a workspace's are sent to it (`syncIndex`) whenever the
 * catalogue's `version` changed since it last saw them.
 */

export class RecognitionServiceError extends Error {
  constructor(
    message: string,
    /** The service read the file and found no usable audio: retrying won't help. */
    readonly unreadableAudio = false,
  ) {
    super(message);
    this.name = "RecognitionServiceError";
  }
}

export interface IndexTrack {
  trackId: string;
  /** Changes whenever the song's fingerprint is replaced. */
  fingerprintUpdatedAt: Date;
}

/** A short id for "these songs with these fingerprints", so the service
 *  knows when its copy of a workspace's index is out of date. */
export function catalogueVersion(tracks: readonly IndexTrack[]): string {
  const lines = tracks
    .map((t) => `${t.trackId}:${t.fingerprintUpdatedAt.getTime()}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(lines).digest("hex").slice(0, 24);
}

/** Identifies a song's current fingerprint: it changes when the recording is uploaded again. */
export function fingerprintKey(track: IndexTrack): string {
  return String(track.fingerprintUpdatedAt.getTime());
}

/** Fingerprints per request when the service is missing some (~15 KB each). */
const INDEX_BATCH = 500;

export interface RecognizerClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  /** Per request. Matching a long post on a busy server can take a while. */
  timeoutMs?: number;
}

export class RecognizerClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: RecognizerClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 300_000;
  }

  async health(): Promise<{ ok: boolean; algorithm: string }> {
    const res = await this.request("GET", "/health");
    return (await res.json()) as { ok: boolean; algorithm: string };
  }

  async fingerprint(audio: Uint8Array): Promise<RecognitionFingerprint> {
    const res = await this.request("POST", "/fingerprint", audio, "application/octet-stream");
    return (await res.json()) as RecognitionFingerprint;
  }

  /**
   * Makes the service hold this version of a workspace's index without
   * sending every fingerprint each time: the list of songs goes first (with a
   * key per fingerprint, `fingerprintKey`); the service reuses what it holds
   * and names the songs it's missing, which are loaded with `load` and sent
   * in batches; then the list again. A 20,000-song catalogue is ~300 MB of
   * fingerprints, which this never holds in memory at once.
   */
  async syncIndex(
    workspaceId: string,
    version: string,
    tracks: readonly IndexTrack[],
    load: (trackIds: string[]) => Promise<{ trackId: string; fingerprint: Uint8Array }[]>,
    batchSize = INDEX_BATCH,
  ): Promise<{ sent: number }> {
    const path = `/index/${encodeURIComponent(workspaceId)}`;
    const listing = JSON.stringify({ version, tracks: tracks.map((t) => ({ id: t.trackId, key: fingerprintKey(t) })) });
    let res = await this.request("PUT", path, listing, "application/json", [409]);
    if (res.ok) return { sent: 0 };
    const missing = ((await res.json()) as { missing?: string[] }).missing ?? [];
    if (missing.length === 0) throw new RecognitionServiceError("The recognition service refused the index.");
    const keys = new Map(tracks.map((t) => [t.trackId, fingerprintKey(t)]));
    for (let i = 0; i < missing.length; i += batchSize) {
      const batch = await load(missing.slice(i, i + batchSize));
      const body = JSON.stringify({
        tracks: batch.map((t) => ({ id: t.trackId, key: keys.get(t.trackId), fingerprint: Buffer.from(t.fingerprint).toString("base64") })),
      });
      await this.request("POST", `${path}/tracks`, body, "application/json");
    }
    res = await this.request("PUT", path, listing, "application/json", [409]);
    if (!res.ok) throw new RecognitionServiceError("The recognition service is still missing fingerprints after they were sent.");
    return { sent: missing.length };
  }

  /** `null` when the service doesn't have this version of the index: load it and ask again. */
  async match(workspaceId: string, version: string, audio: Uint8Array): Promise<RecognitionMatchResult | null> {
    const res = await this.request(
      "POST",
      `/match/${encodeURIComponent(workspaceId)}?version=${encodeURIComponent(version)}`,
      audio,
      "application/octet-stream",
      [409],
    );
    if (res.status === 409) return null;
    return (await res.json()) as RecognitionMatchResult;
  }

  async forget(workspaceId: string): Promise<void> {
    await this.request("DELETE", `/index/${encodeURIComponent(workspaceId)}`);
  }

  private async request(
    method: string,
    path: string,
    body?: Uint8Array | string,
    contentType?: string,
    passStatuses: number[] = [],
  ): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(contentType ? { "Content-Type": contentType } : {}),
        },
        body: body as BodyInit | undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new RecognitionServiceError(`The recognition service can't be reached (${error instanceof Error ? error.message : String(error)}).`);
    }
    if (res.ok || passStatuses.includes(res.status)) return res;
    const detail = await res.json().then((j: { error?: string }) => j.error ?? "").catch(() => "");
    if (res.status === 422) throw new RecognitionServiceError(detail || "The file has no readable audio.", true);
    throw new RecognitionServiceError(`The recognition service answered ${res.status}${detail ? `: ${detail}` : ""}.`);
  }
}
