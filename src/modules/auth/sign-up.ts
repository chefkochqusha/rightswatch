import { createUserAccount } from "./create-user-account";
import { generateUniqueSlug } from "./slug";
import type { MembershipRepository, UserRepository, WorkspaceRepository } from "./types";

export interface SignUpInput {
  email: string;
  password: string;
  name: string | null;
  workspaceName: string;
}

export interface SignUpDependencies {
  userRepository: UserRepository;
  workspaceRepository: WorkspaceRepository;
  membershipRepository: MembershipRepository;
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

/**
 * Phase 5 (Brief §40/§43): the only way a *new* workspace is created —
 * signup always creates exactly one new workspace and makes its creator
 * the OWNER (Brief's Role comment: "OWNER // everything"). Joining an
 * *existing* workspace instead goes through `acceptInvite`, which shares
 * this function's account-creation core (`createUserAccount`) but skips
 * workspace creation entirely — seeing both makes clear this isn't
 * duplicated logic that drifted, it's the same core used two ways.
 */
export async function signUp(
  input: SignUpInput,
  deps: SignUpDependencies,
): Promise<SignUpResult> {
  const workspaceName = input.workspaceName.trim();
  if (workspaceName.length === 0) {
    return { ok: false, error: "MISSING_WORKSPACE_NAME" };
  }

  const created = await createUserAccount(
    { email: input.email, password: input.password, name: input.name },
    { userRepository: deps.userRepository },
  );
  if (!created.ok) {
    return created;
  }
  const user = created.user;

  const slug = await generateUniqueSlug(workspaceName, async (candidate) => {
    const found = await deps.workspaceRepository.findBySlug(candidate);
    return found !== null;
  });
  const workspace = await deps.workspaceRepository.create({ name: workspaceName, slug });

  await deps.membershipRepository.create({
    userId: user.id,
    workspaceId: workspace.id,
    role: "OWNER",
  });

  return {
    ok: true,
    user: { id: user.id, email: user.email, name: user.name },
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
  };
}
