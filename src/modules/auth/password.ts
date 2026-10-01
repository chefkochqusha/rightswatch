import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing (Master Brief §17: "secure password hashing") with
 * Node's built-in scrypt. bcrypt and argon2 both ship native bindings that
 * need a binary download or compile step; scrypt needs nothing, on any
 * machine, including Vercel's build.
 *
 * Stored format: `scrypt$N$r$p$<salt-hex>$<hash-hex>`. The cost parameters
 * travel with each hash, so they can be raised later without locking anyone
 * out: `verifyPassword` reads them back from the string, and `needsRehash`
 * tells `logIn` to re-store a password at the current cost the next time
 * its owner logs in. Hashes written before this format existed
 * (`<salt-hex>:<hash-hex>`, Node's default N=2^14, r=8, p=1) still verify,
 * and are upgraded the same way.
 */

interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/** OWASP Password Storage Cheat Sheet's scrypt minimum. Memory per hash is
 *  128·N·r = 16 MiB whatever p is (Node computes the p lanes one after
 *  another), so p=5 costs CPU time, not memory — fine for a serverless
 *  function. */
const CURRENT_PARAMS: ScryptParams = { N: 2 ** 14, r: 8, p: 5 };
/** What `hashPassword` used before hashes carried their own parameters. */
const LEGACY_PARAMS: ScryptParams = { N: 2 ** 14, r: 8, p: 1 };

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const PREFIX = "scrypt";
/** Above 128·N·r for CURRENT_PARAMS with room to raise them; also the ceiling
 *  a stored hash's own parameters are allowed to ask for (`isSupported`). */
const MAX_MEMORY_BYTES = 64 * 1024 * 1024;

function scrypt(password: string, salt: Buffer, keyLength: number, params: ScryptParams): Promise<Buffer> {
  const options: ScryptOptions = { N: params.N, r: params.r, p: params.p, maxmem: MAX_MEMORY_BYTES };
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/** Hashes a password for `User.passwordHash` (Brief §43), with a fresh random
 *  salt every call — the same password never hashes to the same string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH, CURRENT_PARAMS);
  const { N, r, p } = CURRENT_PARAMS;
  return [PREFIX, N, r, p, salt.toString("hex"), key.toString("hex")].join("$");
}

/** Checks a password against a stored hash in either format, in constant time
 *  so response timing can't leak how much of the hash matched. A malformed
 *  stored value fails closed rather than throwing. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseStoredHash(stored);
  if (!parsed) return false;
  const key = await scrypt(password, parsed.salt, parsed.hash.length, parsed.params);
  return key.length === parsed.hash.length && timingSafeEqual(key, parsed.hash);
}

/** Whether a stored hash predates the current format or cost parameters.
 *  Only meaningful after `verifyPassword` succeeded: that's the one moment
 *  the plaintext is available to hash again. */
export function needsRehash(stored: string): boolean {
  const parsed = parseStoredHash(stored);
  return parsed !== null && !parsed.isCurrent;
}

const TIMING_SALT = randomBytes(SALT_LENGTH);

/**
 * The same scrypt work `verifyPassword` does for a current-format hash, for a
 * login attempt on an email with no account. Without it, an unknown email
 * answered before any hashing happened and a known one ~40 ms later — a
 * reliable timing oracle for which emails are registered (raised by an
 * independent security review). Always resolves `false`.
 */
export async function simulatePasswordCheck(password: string): Promise<false> {
  await scrypt(password, TIMING_SALT, KEY_LENGTH, CURRENT_PARAMS);
  return false;
}

function parseStoredHash(
  stored: string,
): { params: ScryptParams; salt: Buffer; hash: Buffer; isCurrent: boolean } | null {
  const parts = stored.split("$");
  if (parts.length === 6 && parts[0] === PREFIX) {
    const [, n, r, p, saltHex, hashHex] = parts;
    const params = { N: Number(n), r: Number(r), p: Number(p) };
    if (!isSupported(params) || !isHex(saltHex) || !isHex(hashHex)) return null;
    return {
      params,
      salt: Buffer.from(saltHex, "hex"),
      hash: Buffer.from(hashHex, "hex"),
      isCurrent:
        params.N === CURRENT_PARAMS.N && params.r === CURRENT_PARAMS.r && params.p === CURRENT_PARAMS.p,
    };
  }

  const legacy = stored.split(":");
  if (legacy.length === 2 && isHex(legacy[0]) && isHex(legacy[1])) {
    return {
      params: LEGACY_PARAMS,
      salt: Buffer.from(legacy[0], "hex"),
      hash: Buffer.from(legacy[1], "hex"),
      isCurrent: false,
    };
  }
  return null;
}

function isHex(value: string): boolean {
  return value.length > 0 && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value);
}

function isSupported({ N, r, p }: ScryptParams): boolean {
  return (
    Number.isInteger(N) &&
    N > 1 &&
    (N & (N - 1)) === 0 &&
    Number.isInteger(r) &&
    r > 0 &&
    Number.isInteger(p) &&
    p > 0 &&
    p <= 16 &&
    128 * N * r <= MAX_MEMORY_BYTES
  );
}
