import type { Role } from "@/modules/auth";

/** Display names for `Role` (Brief §16). */
export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  ANALYST: "Analyst",
  VIEWER: "Viewer",
};
