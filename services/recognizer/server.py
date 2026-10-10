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
    PUT  /index/<ws>  {"version", "tracks": [{"id", "fingerprint"}]} -> {"tracks": n}
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
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import bekvor_fp as fp

TOKEN = os.environ.get("RECOGNIZER_TOKEN", "")
PORT = int(os.environ.get("PORT", "8090"))
HOST = os.environ.get("HOST", "0.0.0.0")
MAX_AUDIO_BYTES = int(os.environ.get("RECOGNIZER_MAX_AUDIO_MB", "200")) * 1024 * 1024
MAX_INDEX_BYTES = int(os.environ.get("RECOGNIZER_MAX_INDEX_MB", "1024")) * 1024 * 1024
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

    def put(self, workspace: str, version: str, index: fp.Index) -> None:
        with self.lock:
            self.items[workspace] = (version, index)
            self.items.move_to_end(workspace)
            while len(self.items) > self.capacity:
                self.items.popitem(last=False)

    def drop(self, workspace: str) -> None:
        with self.lock:
            self.items.pop(workspace, None)


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
                "algorithm": fp.ALGORITHM,
                "fingerprint": base64.b64encode(f.to_bytes()).decode(),
                "durationSec": round(f.duration_sec, 2),
                "hashCount": int(len(f.hashes)),
            })
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
        try:
            body = json.loads(data)
            tracks = [(str(t["id"]), fp.Fingerprint.from_bytes(base64.b64decode(t["fingerprint"]))) for t in body["tracks"]]
            version = str(body["version"])
        except (KeyError, ValueError, TypeError) as e:
            return self._send(400, {"error": f"Bad index: {e}"})
        with SLOTS:
            started = time.time()
            INDEXES.put(ws, version, fp.Index(tracks))
        log("info", "index", workspace=ws, tracks=len(tracks), ms=round((time.time() - started) * 1000))
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
