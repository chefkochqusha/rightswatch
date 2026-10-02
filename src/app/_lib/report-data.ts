import { getCaseStore } from "./case-store";
import { getWorkspaceScanItems } from "./workspace-scan-store";
import { getWorkspaceMembers } from "./members";
import { dataModeFor } from "./connector-mode";
import { CASE_PRIORITY_LABELS, CASE_STATUS_LABELS } from "@/components/cases/labels";
import { REASON_LABELS, STATUS_LABELS } from "@/components/rights/labels";
import type { CasePriority, CaseStatus } from "@/modules/cases";
import { detectionRows, itemsInPeriod, type DetectionLookups, type ReportPeriod } from "@/modules/reports";

export const REPORT_PERIODS: { key: ReportPeriod; label: string }[] = [
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "all", label: "All time" },
];

export function parsePeriod(value: unknown): ReportPeriod {
  return REPORT_PERIODS.find((p) => p.key === value)?.key ?? "90d";
}

/** What a workspace's report is built from, in the period asked for. */
export async function loadReportData(workspace: { id: string; slug: string }, period: ReportPeriod, now = new Date()) {
  const workspaceId = workspace.id;
  const [items, cases, members] = await Promise.all([
    getWorkspaceScanItems(workspaceId),
    getCaseStore().cases.findForWorkspace(workspaceId),
    getWorkspaceMembers(workspaceId),
  ]);
  const inPeriod = itemsInPeriod(items, period, now);
  const lookups: DetectionLookups = {
    caseByAssessment: new Map(cases.map((c) => [c.rightsAssessmentId, c])),
    memberName: new Map(members.map((m) => [m.userId, m.name])),
    statusLabel: (status) => STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status,
    reasonLabel: (reason) => REASON_LABELS[reason as keyof typeof REASON_LABELS] ?? reason,
    caseStatusLabel: (status) => CASE_STATUS_LABELS[status as CaseStatus] ?? status,
    casePriorityLabel: (priority) => CASE_PRIORITY_LABELS[priority as CasePriority] ?? priority,
    isDemo: dataModeFor(workspace) === "DEMO",
  };
  return { items: inPeriod, cases, lookups, rows: () => detectionRows(inPeriod, lookups) };
}
