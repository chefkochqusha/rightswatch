"use server";

import { getAuthStore } from "@/app/_lib/auth-store";
import { getSessionSecret } from "@/app/_lib/session-cookie";
import { requireWorkspaceManager } from "@/app/_lib/authorize";
import { inviteTeammate } from "@/modules/auth";
import type { Role } from "@/modules/auth";

export interface InviteTeammateFormState {
  fieldErrors?: Partial<Record<"email" | "role", string>>;
  formError?: string;
  /** Set on success — the raw invite token, turned into a shareable link by
   *  the client component (RightsWatch sends no email yet, see
   *  `modules/auth/invite-token.ts`'s doc comment). */
  issuedToken?: string;
  invitedEmail?: string;
}

export async function inviteTeammateAction(
  _prevState: InviteTeammateFormState,
  formData: FormData,
): Promise<InviteTeammateFormState> {
  const email = String(formData.get("email") ?? "");
  const role = String(formData.get("role") ?? "") as Role;

  const session = await requireWorkspaceManager();
  const store = getAuthStore();
  const result = await inviteTeammate(
    {
      workspaceId: session.workspace.id,
      workspaceName: session.workspace.name,
      email,
      role,
    },
    { userRepository: store.users, secret: getSessionSecret() },
  );

  if (!result.ok) {
    if (result.error === "INVALID_EMAIL") {
      return { fieldErrors: { email: "Enter a valid email address." } };
    }
    if (result.error === "INVALID_ROLE") {
      return { fieldErrors: { role: "Choose a role to invite them as." } };
    }
    return {
      formError:
        "That email already has a RightsWatch account — ask them to log in instead of inviting them.",
    };
  }

  return { issuedToken: result.token, invitedEmail: email.trim().toLowerCase() };
}
