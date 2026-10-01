import { UniqueConstraintError } from "./errors";
import { prepareUserAccount } from "./prepare-user-account";
import { generateUniqueSlug } from "./slug";
import type { AccountRepository, UserRepository, WorkspaceRepository } from "./types";

export interface SignUpInput {
  email: string;
  password: string;
  name: string | null;
  workspaceName: string;
}

export interface SignUpDependencies {
  userRepository: UserRepository;
  workspaceRepository: WorkspaceRepository;
  accountRepository: AccountRepository;
}

export type SignUpResult =
  | {
      ok: true;
      user: { id: string; email: string; name: string | null };
      workspace: { id: string; name: string; slug: string };
    }
  | {
      ok: false;
      error:
        | "INVALID_EMAIL"
        | "WEAK_PASSWORD"
        | "MISSING_WORKSPACE_NAME"
        | "EMAIL_ALREADY_REGISTERED";
    };

/** A slug that was free when checked can be taken by a concurrent signup
 *  before this one's write lands; this bounds the retries. */
const MAX_WRITE_ATTEMPTS = 3;

/**
 * Phase 5 (Brief §40/§43): the only way a *new* workspace is created —
 * signup always creates exactly one new workspace and makes its creator
 * the OWNER (Brief's Role comment: "OWNER // everything"). Joining an
 * *existing* workspace goes through `acceptInvite` instead, which shares
 * this function's account core (`prepareUserAccount`) but joins rather
 * than creates.
 *
 * The user, workspace and OWNER membership are one atomic write
 * (`AccountRepository`). If it collides on the slug — two signups with the
 * same workspace name at once — nothing was written, so a fresh slug is
 * simply tried again; if it collides on the email, the other signup won.
 */
export async function signUp(
  input: SignUpInput,
  deps: SignUpDependencies,
): Promise<SignUpResult> {
  const workspaceName = input.workspaceName.trim();
  if (workspaceName.length === 0) {
    return { ok: false, error: "MISSING_WORKSPACE_NAME" };
  }

  const prepared = await prepareUserAccount(
    { email: input.email, password: input.password, name: input.name },
    { userRepository: deps.userRepository },
  );
  if (!prepared.ok) {
    return prepared;
  }

  for (let attempt = 1; ; attempt++) {
    const slug = await generateUniqueSlug(workspaceName, async (candidate) => {
      const found = await deps.workspaceRepository.findBySlug(candidate);
      return found !== null;
    });

    try {
      const { user, workspace } = await deps.accountRepository.createAccount({
        user: prepared.account,
        role: "OWNER",
        workspace: { newName: workspaceName, newSlug: slug },
      });
      return {
        ok: true,
        user: { id: user.id, email: user.email, name: user.name },
        workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
      };
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) throw error;
      if (
        error.field === "email" ||
        (await deps.userRepository.findByEmail(prepared.account.email)) !== null
      ) {
        return { ok: false, error: "EMAIL_ALREADY_REGISTERED" };
      }
      if (attempt >= MAX_WRITE_ATTEMPTS) throw error;
    }
  }
}
