import { hashPassword } from "./password";
import type { NewAccount, UserRepository } from "./types";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;

export interface PrepareUserAccountInput {
  email: string;
  password: string;
  name: string | null;
}

export interface PrepareUserAccountDependencies {
  userRepository: UserRepository;
}

export type PrepareUserAccountResult =
  | { ok: true; account: NewAccount }
  | { ok: false; error: "INVALID_EMAIL" | "WEAK_PASSWORD" | "EMAIL_ALREADY_REGISTERED" };

/**
 * The account core shared by `signUp` (new workspace) and `acceptInvite`
 * (existing workspace), so the two never validate an email or hash a
 * password differently. Knows nothing about workspaces or memberships.
 *
 * Writes nothing: the account is created together with its membership in
 * one atomic `AccountRepository.createAccount` (see `types.ts` for why).
 * The early email check here gives the common duplicate a friendly error;
 * the database's unique constraint still decides a race.
 */
export async function prepareUserAccount(
  input: PrepareUserAccountInput,
  deps: PrepareUserAccountDependencies,
): Promise<PrepareUserAccountResult> {
  const email = input.email.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "INVALID_EMAIL" };
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: "WEAK_PASSWORD" };
  }

  const existing = await deps.userRepository.findByEmail(email);
  if (existing) {
    return { ok: false, error: "EMAIL_ALREADY_REGISTERED" };
  }

  return {
    ok: true,
    account: {
      email,
      passwordHash: await hashPassword(input.password),
      name: input.name?.trim() || null,
    },
  };
}
