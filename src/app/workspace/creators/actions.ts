"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCaseManager } from "@/app/_lib/authorize";
import { getCreatorStore } from "@/app/_lib/creator-store";
import { getCreatorAllowance } from "@/app/_lib/creator-allowance";
import { dataModeFor } from "@/app/_lib/connector-mode";
import { getAuditStore } from "@/app/_lib/audit-store";
import {
  addCreator,
  pauseCreator,
  removeCreator,
  resumeCreator,
  updateCreatorDetails,
  type AddCreatorError,
} from "@/modules/creators";
import { DEMO_NAMED_CREATORS } from "@/modules/demo-data";

/**
 * Watchlist actions (Brief §8). Every one is gated to the ANALYST tier and
 * up (`requireCaseManager`), scoped to the caller's workspace by the
 * module itself, and audit-logged (Brief §14: "user added creator" is the
 * Brief's own first example of an auditable mutation).
 */

export interface CreatorFormState {
  fieldErrors?: Partial<Record<"username" | "displayName" | "country" | "followerCount", string>>;
  formError?: string;
  /** Set on success: the handle just added (or restored). */
  added?: string;
  restored?: boolean;
  saved?: boolean;
}

const ERROR_MESSAGES: Record<AddCreatorError, { field?: keyof NonNullable<CreatorFormState["fieldErrors"]>; message: string }> = {
  USERNAME_REQUIRED: { field: "username", message: "Enter the creator's TikTok username." },
  USERNAME_INVALID: {
    field: "username",
    message: "That isn't a TikTok username. Usernames use letters, numbers, underscores and periods, up to 24 characters.",
  },
  DISPLAY_NAME_TOO_LONG: { field: "displayName", message: "Keep the display name under 80 characters." },
  COUNTRY_INVALID: { field: "country", message: "Choose a country from the list." },
  FOLLOWERS_INVALID: { field: "followerCount", message: "Enter a follower count, like 182000 or 182K." },
  ALREADY_ON_WATCHLIST: { field: "username", message: "This creator is already on your watchlist." },
  NO_PLAN: { message: "Choose a plan to start monitoring creators. Every plan starts with a free trial." },
  LIMIT_REACHED: { message: "Your plan's creator limit is reached. Pause a creator or upgrade to add more." },
};

function stateFor(error: AddCreatorError): CreatorFormState {
  const { field, message } = ERROR_MESSAGES[error];
  return field ? { fieldErrors: { [field]: message } } : { formError: message };
}

export async function addCreatorAction(_prev: CreatorFormState, formData: FormData): Promise<CreatorFormState> {
  const session = await requireCaseManager();
  const result = await addCreator(
    {
      workspaceId: session.workspace.id,
      username: String(formData.get("username") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      country: String(formData.get("country") ?? ""),
      followerCount: String(formData.get("followerCount") ?? ""),
    },
    { creatorRepository: getCreatorStore().creators, allowance: await getCreatorAllowance(session.workspace.id) },
  );
  if (!result.ok) return stateFor(result.error);

  await audit(session.workspace.id, session.user.id, result.restored ? "creator.restored" : "creator.added", result.creator.id, {
    handle: result.creator.handle,
  });
  revalidatePath("/workspace", "layout");
  return { added: result.creator.handle, restored: result.restored };
}

/**
 * Demo mode only: adds Brief §62's six demo creators with their details,
 * as far as the plan allows — a quick way to see a scan work end to end.
 */
export async function addDemoCreatorsAction(): Promise<void> {
  const session = await requireCaseManager();
  if (dataModeFor(session.workspace) !== "DEMO") throw new Error("Demo creators are only available in demo mode.");

  const deps = { creatorRepository: getCreatorStore().creators, allowance: await getCreatorAllowance(session.workspace.id) };
  for (const creator of DEMO_NAMED_CREATORS) {
    const result = await addCreator(
      {
        workspaceId: session.workspace.id,
        username: creator.handle,
        displayName: creator.displayName,
        country: creator.country,
        followerCount: creator.followerCount,
      },
      deps,
    );
    if (result.ok) {
      await audit(session.workspace.id, session.user.id, result.restored ? "creator.restored" : "creator.added", result.creator.id, {
        handle: result.creator.handle,
      });
    } else if (result.error === "NO_PLAN" || result.error === "LIMIT_REACHED") {
      break;
    }
  }
  revalidatePath("/workspace", "layout");
}

export async function pauseCreatorAction(formData: FormData): Promise<void> {
  const session = await requireCaseManager();
  const creatorId = String(formData.get("creatorId") ?? "");
  const result = await pauseCreator(
    { workspaceId: session.workspace.id, creatorId },
    { creatorRepository: getCreatorStore().creators },
  );
  if (!result.ok) throw new Error("That creator isn't on your watchlist.");
  await audit(session.workspace.id, session.user.id, "creator.paused", creatorId, { handle: result.creator.handle });
  revalidatePath("/workspace", "layout");
}

export async function resumeCreatorAction(_prev: CreatorFormState, formData: FormData): Promise<CreatorFormState> {
  const session = await requireCaseManager();
  const creatorId = String(formData.get("creatorId") ?? "");
  const result = await resumeCreator(
    { workspaceId: session.workspace.id, creatorId },
    { creatorRepository: getCreatorStore().creators, allowance: await getCreatorAllowance(session.workspace.id) },
  );
  if (!result.ok) {
    if (result.error === "NOT_FOUND") return { formError: "That creator isn't on your watchlist." };
    return { formError: ERROR_MESSAGES[result.error].message };
  }
  await audit(session.workspace.id, session.user.id, "creator.resumed", creatorId, { handle: result.creator.handle });
  revalidatePath("/workspace", "layout");
  return { saved: true };
}

export async function removeCreatorAction(formData: FormData): Promise<void> {
  const session = await requireCaseManager();
  const creatorId = String(formData.get("creatorId") ?? "");
  const creators = getCreatorStore().creators;
  const creator = await creators.findById(session.workspace.id, creatorId);
  const result = await removeCreator({ workspaceId: session.workspace.id, creatorId }, { creatorRepository: creators });
  if (!result.ok) throw new Error("That creator isn't on your watchlist.");
  await audit(session.workspace.id, session.user.id, "creator.removed", creatorId, { handle: creator?.handle ?? null });
  revalidatePath("/workspace", "layout");
  redirect("/workspace/creators");
}

export async function updateCreatorDetailsAction(_prev: CreatorFormState, formData: FormData): Promise<CreatorFormState> {
  const session = await requireCaseManager();
  const creatorId = String(formData.get("creatorId") ?? "");
  const result = await updateCreatorDetails(
    {
      workspaceId: session.workspace.id,
      creatorId,
      displayName: String(formData.get("displayName") ?? ""),
      country: String(formData.get("country") ?? ""),
      followerCount: String(formData.get("followerCount") ?? ""),
    },
    { creatorRepository: getCreatorStore().creators },
  );
  if (!result.ok) {
    if (result.error === "NOT_FOUND") return { formError: "That creator isn't on your watchlist." };
    return stateFor(result.error);
  }
  await audit(session.workspace.id, session.user.id, "creator.updated", creatorId, { handle: result.creator.handle });
  revalidatePath("/workspace", "layout");
  return { saved: true };
}

async function audit(
  workspaceId: string,
  actorId: string,
  action: string,
  creatorId: string,
  metadata: Record<string, string | null>,
): Promise<void> {
  await getAuditStore().auditLogs.create({ workspaceId, actorId, action, targetType: "creator", targetId: creatorId, metadata });
}
