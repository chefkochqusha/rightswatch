"use server";

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
  const result = await inviteTeammate(
    {
      workspaceId: session.workspace.id,
      workspaceName: session.workspace.name,
      email,
      role,
    },
    { secret: getSessionSecret() },
  );

  if (!result.ok) {
    if (result.error === "INVALID_EMAIL") {
      return { fieldErrors: { email: "Enter a valid email address." } };
    }
    return { fieldErrors: { role: "Choose a role to invite them as." } };
  }

  return { issuedToken: result.token, invitedEmail: email.trim().toLowerCase() };
}
