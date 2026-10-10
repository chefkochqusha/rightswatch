import { createHash } from "node:crypto";
import type { RecognitionFingerprint, RecognitionMatchResult } from "./types";

/**
 * Talks to the recognition service (`services/recognizer/server.py`) on the
 * server's private network. The service keeps nothing: fingerprints live in
 * Postgres, and a workspace's are sent to it (`loadIndex`) whenever the
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

  async loadIndex(workspaceId: string, version: string, tracks: { trackId: string; fingerprint: Uint8Array }[]): Promise<void> {
    const body = JSON.stringify({
      version,
      tracks: tracks.map((t) => ({ id: t.trackId, fingerprint: Buffer.from(t.fingerprint).toString("base64") })),
    });
    await this.request("PUT", `/index/${encodeURIComponent(workspaceId)}`, body, "application/json");
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
