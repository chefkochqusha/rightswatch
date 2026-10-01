import { getCurrentSession } from "@/app/_lib/current-user";
import { getAuditStore } from "@/app/_lib/audit-store";
import { loadReportData, parsePeriod } from "@/app/_lib/report-data";
import { toCsv } from "@/modules/reports";

/**
 * GET /workspace/reports/export?period=30d|90d|all — the detections as a
 * CSV (Brief §26). Any member may export what they can already read; the
 * export is written to the audit log.
 */
export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return new Response("Log in to export a report.", { status: 401 });

  const period = parsePeriod(new URL(request.url).searchParams.get("period"));
  const data = await loadReportData(session.workspace.id, period);
  const rows = data.rows();

  await getAuditStore().auditLogs.create({
    workspaceId: session.workspace.id,
    actorId: session.user.id,
    action: "report.exported",
    targetType: "report",
    targetId: period,
    metadata: { rows: rows.length - 1 },
  });

  const today = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rightswatch-detections-${period}-${today}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
