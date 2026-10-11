"""Bekvor's song-recognition service: a small HTTP server for the app's
worker, reachable only inside the server's private network.

It keeps no data of its own. The app sends audio, gets a fingerprint back
and stores it in Postgres (so backups cover it); to search, it sends a
workspace's fingerprints once (`PUT /index/<workspace>`) and the audio of a
post (`POST /match/<workspace>`). Indexes are kept in memory, a few
workspaces at a time, and rebuilt when the app says the catalogue changed
(the `version` it sends).

Endpoints (all but /health need `Authorization: Bearer $RECOGNIZER_TOKEN`):

    GET  /health                           -> {"ok": true, "algorithm": ...}
    POST /fingerprint        (audio bytes) -> {"fingerprint": base64, "durationSec", "hashCount", "algorithm"}
    PUT  /index/<ws>  {"version", "tracks": [{"id", "key", "fingerprint"?}]}
                                           -> {"tracks": n}, or 409 {"missing": [ids]}
    POST /index/<ws>/tracks  {"tracks": [{"id", "key", "fingerprint"}]} -> {"staged": n}

Large catalogues don't send every fingerprint each time: the app sends the
list of songs with a `key` per fingerprint (when it last changed), the
service reuses what its previous index already holds and answers with the
songs it is `missing`; the app stages those in batches (POST .../tracks) and
sends the list again. A track that comes with its fingerprint is used as is.
    POST /match/<ws>?version=<v>  (audio)  -> match result, or 409 when the
                                              index for that version isn't loaded
    DELETE /index/<ws>                     -> forget a workspace's index

Uploaded audio is decoded through a temporary file that is deleted at once;
nothing is written anywhere else.
"""
from __future__ import annotations

import base64
import hmac
import json
import os
import re
import sys
import threading
import time
import zlib
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import numpy as np

import bekvor_fp as fp

TOKEN = os.environ.get("RECOGNIZER_TOKEN", "")
PORT = int(os.environ.get("PORT", "8090"))
HOST = os.environ.get("HOST", "0.0.0.0")
MAX_AUDIO_BYTES = int(os.environ.get("RECOGNIZER_MAX_AUDIO_MB", "200")) * 1024 * 1024
MAX_INDEX_BYTES = int(os.environ.get("RECOGNIZER_MAX_INDEX_MB", "1024")) * 1024 * 1024
# Fingerprints waiting for the next index build, per workspace (raw bytes, ~15 KB a song).
MAX_STAGED_BYTES = int(os.environ.get("RECOGNIZER_MAX_STAGED_MB", "1024")) * 1024 * 1024
MAX_SONG_SECONDS = 20 * 60
MAX_POST_SECONDS = 10 * 60
CACHED_WORKSPACES = int(os.environ.get("RECOGNIZER_CACHED_WORKSPACES", "16"))
# CPU-heavy work at once; more requests wait their turn.
SLOTS = threading.BoundedSemaphore(int(os.environ.get("RECOGNIZER_CONCURRENCY", str(os.cpu_count() or 1))))
WORKSPACE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class Indexes:
    """Workspace indexes in memory, least recently used dropped first."""

    def __init__(self, capacity: int):
        self.capacity = capacity
        self.items: OrderedDict[str, tuple[str, fp.Index]] = OrderedDict()
        self.lock = threading.Lock()

    def get(self, workspace: str, version: str) -> fp.Index | None:
        with self.lock:
            entry = self.items.get(workspace)
            if not entry or entry[0] != version:
                return None
            self.items.move_to_end(workspace)
            return entry[1]

    def latest(self, workspace: str) -> fp.Index | None:
        """The workspace's index whatever its version: the base for a rebuild."""
        with self.lock:
            entry = self.items.get(workspace)
            return entry[1] if entry else None

    def put(self, workspace: str, version: str, index: fp.Index) -> None:
        with self.lock:
            self.items[workspace] = (version, index)
            self.items.move_to_end(workspace)
            while len(self.items) > self.capacity:
                self.items.popitem(last=False)

    def drop(self, workspace: str) -> None:
        with self.lock:
            self.items.pop(workspace, None)
            STAGED.pop(workspace, None)


# Staged fingerprints: workspace -> {(track id, key): bytes}
STAGED: dict[str, dict[tuple[str, str], bytes]] = {}
STAGED_LOCK = threading.Lock()


def reusable_tracks(previous: fp.Index | None) -> dict[tuple[str, str], fp.Fingerprint]:
    """(id, key) -> fingerprint, rebuilt from what a large previous index holds.
    A small index keeps only pair hashes, so nothing can be taken from it."""
    if previous is None or not previous.large:
        return {}
    out = {}
    for i, key in enumerate(previous.keys):
        if i in previous.legacy:
            f = previous.legacy[i]
        else:
            f = fp.Fingerprint.from_peaks(previous._peaks(i).astype(np.float32), previous.durations[i], previous.melodies[i])
        f.digest = key[1]
        out[key] = f
    return out


INDEXES = Indexes(CACHED_WORKSPACES)


def log(level: str, event: str, **fields) -> None:
    line = json.dumps({"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "level": level, "event": event, **fields})
    print(line, file=sys.stderr if level == "error" else sys.stdout, flush=True)


class Handler(BaseHTTPRequestHandler):
    server_version = "bekvor-recognizer"
    sys_version = ""

    def log_message(self, format, *args):  # quiet default access log
        pass

    # ---------------------------------------------------------------- helpers
    def _send(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _authorized(self) -> bool:
        if not TOKEN:
            return True  # only for local development; the compose file always sets one
        given = self.headers.get("Authorization", "")
        return hmac.compare_digest(given.encode(), f"Bearer {TOKEN}".encode())

    def _body(self, limit: int) -> bytes | None:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > limit:
            self._send(413 if length > limit else 400, {"error": "Body missing or too large."})
            return None
        return self.rfile.read(length)

    def _discard_body(self) -> None:
        remaining = min(int(self.headers.get("Content-Length") or 0), MAX_AUDIO_BYTES)
        while remaining > 0:
            chunk = self.rfile.read(min(remaining, 1 << 20))
            if not chunk:
                break
            remaining -= len(chunk)

    def _workspace(self, path: str, prefix: str) -> str | None:
        ws = path[len(prefix):]
        if not WORKSPACE_ID.match(ws):
            self._send(400, {"error": "Bad workspace id."})
            return None
        return ws

    # ---------------------------------------------------------------- routes
    def do_GET(self):
        if urlparse(self.path).path == "/health":
            return self._send(200, {"ok": True, "algorithm": fp.ALGORITHM, "cachedWorkspaces": len(INDEXES.items)})
        self._send(404, {"error": "Not found."})

    def do_POST(self):
        url = urlparse(self.path)
        if not self._authorized():
            return self._send(401, {"error": "Unauthorized."})
        if url.path == "/fingerprint":
            data = self._body(MAX_AUDIO_BYTES)
            if data is None:
                return
            with SLOTS:
                started = time.time()
                try:
                    y = fp.decode(data, MAX_SONG_SECONDS)
                except fp.AudioError as e:
                    return self._send(422, {"error": str(e)})
                f = fp.fingerprint(y)
            log("info", "fingerprint", seconds=round(f.duration_sec, 1), hashes=int(len(f.hashes)), ms=round((time.time() - started) * 1000))
            return self._send(200, {
                "algorithm": fp.FORMAT_PEAKS,
                "fingerprint": base64.b64encode(f.to_bytes()).decode(),
                "durationSec": round(f.duration_sec, 2),
                "hashCount": int(len(f.hashes)),
            })
        if url.path.startswith("/index/") and url.path.endswith("/tracks"):
            ws = self._workspace(url.path[: -len("/tracks")], "/index/")
            if ws is None:
                return
            data = self._body(MAX_INDEX_BYTES)
            if data is None:
                return
            try:
                batch = {}
                for t in json.loads(data)["tracks"]:
                    raw = base64.b64decode(t["fingerprint"])
                    fp.Fingerprint.from_bytes(raw)  # refuse what can't be read now, not at build time
                    batch[(str(t["id"]), str(t["key"]))] = raw
            except (KeyError, ValueError, TypeError, zlib.error) as e:
                return self._send(400, {"error": f"Bad tracks: {e}"})
            with STAGED_LOCK:
                current = STAGED.setdefault(ws, {})
                size = sum(len(v) for v in current.values()) + sum(len(v) for v in batch.values())
                if size > MAX_STAGED_BYTES:
                    return self._send(413, {"error": "Too many fingerprints waiting."})
                current.update(batch)
            return self._send(200, {"staged": len(batch)})
        if url.path.startswith("/match/"):
            ws = self._workspace(url.path, "/match/")
            if ws is None:
                return
            version = (parse_qs(url.query).get("version") or [""])[0]
            index = INDEXES.get(ws, version)
            if index is None:
                # Read the audio before answering: closing the connection with
                # unread data resets it, and the client would never see the 409.
                self._discard_body()
                return self._send(409, {"error": "Index not loaded.", "needIndex": True})
            data = self._body(MAX_AUDIO_BYTES)
            if data is None:
                return
            with SLOTS:
                started = time.time()
                try:
                    y = fp.decode(data, MAX_POST_SECONDS)
                except fp.AudioError as e:
                    return self._send(422, {"error": str(e)})
                result = fp.match(index, y)
            result["ms"] = round((time.time() - started) * 1000)
            log("info", "match", workspace=ws, seconds=result["durationSec"], candidates=len(result["candidates"]), ms=result["ms"])
            return self._send(200, result)
        self._send(404, {"error": "Not found."})

    def do_PUT(self):
        url = urlparse(self.path)
        if not self._authorized():
            return self._send(401, {"error": "Unauthorized."})
        if not url.path.startswith("/index/"):
            return self._send(404, {"error": "Not found."})
        ws = self._workspace(url.path, "/index/")
        if ws is None:
            return
        data = self._body(MAX_INDEX_BYTES)
        if data is None:
            return
        previous = INDEXES.latest(ws)
        try:
            body = json.loads(data)
            version = str(body["version"])
            listed = [(str(t["id"]), t.get("key"), t.get("fingerprint")) for t in body["tracks"]]
            with STAGED_LOCK:
                staged = dict(STAGED.get(ws, {}))
            reuse = reusable_tracks(previous)
            tracks, missing = [], []
            for track_id, key, b64 in listed:
                if b64 is not None:
                    f = fp.Fingerprint.from_bytes(base64.b64decode(b64))
                    if key is not None:
                        f.digest = str(key)
                elif key is not None and (track_id, str(key)) in staged:
                    f = fp.Fingerprint.from_bytes(staged[(track_id, str(key))])
                    f.digest = str(key)
                elif key is not None and (track_id, str(key)) in reuse:
                    f = reuse[(track_id, str(key))]
                else:
                    missing.append(track_id)
                    continue
                tracks.append((track_id, f))
        except (KeyError, ValueError, TypeError, AttributeError, zlib.error) as e:
            return self._send(400, {"error": f"Bad index: {e}"})
        if missing:
            return self._send(409, {"error": "Fingerprints missing.", "missing": missing})
        del reuse
        with SLOTS:
            started = time.time()
            # Large catalogues: unchanged shards of the previous index are reused.
            index = fp.Index(tracks, previous=previous)
            INDEXES.put(ws, version, index)
        with STAGED_LOCK:
            STAGED.pop(ws, None)
        log("info", "index", workspace=ws, tracks=len(tracks), rebuiltShards=getattr(index, "rebuilt_shards", None), ms=round((time.time() - started) * 1000))
        self._send(200, {"tracks": len(tracks)})

    def do_DELETE(self):
        url = urlparse(self.path)
        if not self._authorized():
            return self._send(401, {"error": "Unauthorized."})
        if not url.path.startswith("/index/"):
            return self._send(404, {"error": "Not found."})
        ws = self._workspace(url.path, "/index/")
        if ws is None:
            return
        INDEXES.drop(ws)
        self._send(200, {"ok": True})


def main():
    if not TOKEN:
        log("warn", "no-token", note="RECOGNIZER_TOKEN is unset: every caller is accepted. Local development only.")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    log("info", "started", port=PORT, algorithm=fp.ALGORITHM)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
