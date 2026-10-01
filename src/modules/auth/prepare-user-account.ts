import { hashPassword } from "./password";
import type { UserRecord, UserRepository } from "./types";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;

export interface CreateUserAccountInput {
  email: string;
  password: string;
  name: string | null;
}

export interface CreateUserAccountDependencies {
  userRepository: UserRepository;
}

export type CreateUserAccountResult =
  | { ok: true; user: UserRecord }
  | { ok: false; error: "INVALID_EMAIL" | "WEAK_PASSWORD" | "EMAIL_ALREADY_REGISTERED" };

/**
 * The account-creation core shared by `signUp` (creates a new workspace
 * too) and `acceptInvite` (joins an existing one instead) — extracted so
 * the two never validate email/password or hash a password differently.
 * Knows nothing about workspaces or memberships on purpose.
 */
export async function createUserAccount(
  input: CreateUserAccountInput,
  deps: CreateUserAccountDependencies,
): Promise<CreateUserAccountResult> {
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

  const passwordHash = await hashPassword(input.password);
  const user = await deps.userRepository.create({
    email,
    passwordHash,
    name: input.name?.trim() || null,
  });

  return { ok: true, user };
}
