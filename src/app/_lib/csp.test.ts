import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContentSecurityPolicy, createNonce } from "./csp";

test("scripts need this request's nonce and nothing may be framed", () => {
  const csp = buildContentSecurityPolicy("abc123", false);
  assert.match(csp, /script-src 'self' 'nonce-abc123' 'strict-dynamic'(;|$)/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /upgrade-insecure-requests/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
});

test("development adds only what hot reload needs", () => {
  const csp = buildContentSecurityPolicy("abc123", true);
  assert.match(csp, /unsafe-eval/);
  assert.match(csp, /connect-src 'self' ws: wss:/);
  assert.doesNotMatch(csp, /upgrade-insecure-requests/);
});

test("a nonce is different every time", () => {
  assert.notEqual(createNonce(), createNonce());
});
