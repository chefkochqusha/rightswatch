import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

/** 64 bytes is generous for scrypt's derived key — matches common guidance
 *  (e.g. Node's own docs example) without pulling in a third-party KDF
 *  package. Using `node:crypto` here (rather than bcrypt/argon2) is a
 *  deliberate sandbox-pragmatic choice too: both of those ship native
 *  bindings that need a binary fetch/compile step, the exact kind of
 *  network operation this sandbox currently blocks for Prisma (see the
 *  project status note); scrypt is built into Node and needs nothing
 *  downloaded, ever, on any machine. */
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Hashes a plaintext password for storage on `User.passwordHash` (Brief
 * §43). Returns `<salt-hex>:<hash-hex>` — a fresh random salt every call,
 * so hashing the same password twice never produces the same string.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

/**
 * Checks a plaintext password against a hash produced by `hashPassword`.
 * Uses a constant-time comparison so response timing can't leak how much
 * of the hash matched.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, 'hex');
  const storedHash = Buffer.from(hashHex, 'hex');
  const derivedKey = (await scrypt(password, salt, storedHash.length)) as Buffer;

  if (derivedKey.length !== storedHash.length) return false;
  return timingSafeEqual(derivedKey, storedHash);
}
