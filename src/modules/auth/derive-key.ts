import { hkdfSync } from "node:crypto";

/**
 * One `SESSION_SECRET`, a separate signing key per token purpose.
 *
 * Session cookies and invite links are both HMAC-signed `body.signature`
 * tokens. Signed with the same raw secret, a token minted for one purpose
 * carried a valid signature for the other, and only a payload-shape check
 * stood between an invite link and a session cookie (raised by an
 * independent security review). HKDF-SHA256 with a per-purpose `info` label
 * makes the two signature spaces disjoint without a second secret to manage.
 *
 * Changing a label (or its `v1` suffix) invalidates every token of that
 * purpose in circulation — which is how a token-format change ships on
 * purpose rather than by accident.
 */
export type KeyPurpose = "session-token" | "invite-token";

export function deriveKey(secret: string, purpose: KeyPurpose): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "", `rightswatch/${purpose}/v1`, 32));
}
