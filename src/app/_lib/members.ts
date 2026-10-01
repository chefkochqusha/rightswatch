import { getAuthStore } from "./auth-store";

export interface WorkspaceMember {
  userId: string;
  name: string;
  email: string;
}

/**
 * A workspace's members as the UI names them — for "assigned to", case
 * notes and the assignee picker. Oldest membership first.
 */
export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const store = getAuthStore();
  const memberships = await store.memberships.findForWorkspace(workspaceId);
  const members: WorkspaceMember[] = [];
  for (const membership of [...memberships].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const user = await store.users.findById(membership.userId);
    if (user) members.push({ userId: user.id, name: user.name ?? user.email, email: user.email });
  }
  return members;
}
