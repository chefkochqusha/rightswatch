import { recordAudit } from "@/app/_lib/audit-event";
import { canManageWorkspace } from "@/app/_lib/authorize";
import { getCurrentSession } from "@/app/_lib/current-user";
import { DEMO_WORKSPACE_SLUG } from "@/app/_lib/demo-access";
import { spendRequest } from "@/app/_lib/request-limit";
import { buildDataExport } from "@/app/_lib/workspace-export";
import { exportFileName, parseExportScope } from "@/modules/reports";

/**
 * GET /workspace/settings/export?scope=workspace|account — a JSON file of the
 * data the workspace holds (`scope=workspace`, owners and admins) or of the
 * signed-in person's own account (`scope=account`, any member): GDPR access
 * and portability. Written to the audit log. Not available in the public demo,
 * whose data is fictional and shared.
 */
export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return new Response("Log in to download your data.", { status: 401 });
  if (session.workspace.slug === DEMO_WORKSPACE_SLUG) return new Response("The public demo has no data of its own to export.", { status: 403 });

  const scope = parseExportScope(new URL(request.url).searchParams.get("scope"));
  if (scope === "workspace" && !canManageWorkspace(session.role)) {
    return new Response("Only owners and admins can download the workspace's data.", { status: 403 });
  }

  // A full export reads the whole workspace: a few a hour is plenty.
  const wait = await spendRequest("data-export", session.user.id, { max: 5, windowMs: 60 * 60_000, shared: true });
  if (wait !== null) {
    return new Response(`Too many exports. Try again in ${Math.ceil(wait / 60)} minutes.`, { status: 429, headers: { "Retry-After": String(wait), "Cache-Control": "no-store" } });
  }

  const now = new Date();
  const data = await buildDataExport(session, scope, now);

  await recordAudit({ workspaceId: session.workspace.id, actorId: session.user.id, action: "data.exported", targetType: "export", targetId: scope });

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(scope, session.workspace.slug, now)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
