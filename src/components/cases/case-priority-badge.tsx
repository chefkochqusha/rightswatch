import type { CasePriority } from "@/modules/cases";
import { CASE_PRIORITY_LABELS } from "./labels";

/** Priority as a word plus a small bar meter, so it never relies on colour alone. */
const LEVEL: Record<CasePriority, { bars: number; tone: string }> = {
  LOW: { bars: 1, tone: "text-t2" },
  MEDIUM: { bars: 2, tone: "text-unknown" },
  HIGH: { bars: 3, tone: "text-mismatch" },
  CRITICAL: { bars: 4, tone: "text-mismatch" },
};

export function CasePriorityBadge({ priority }: { priority: CasePriority }) {
  const { bars, tone } = LEVEL[priority];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[0.8125rem] font-medium whitespace-nowrap ${tone}`}>
      <span aria-hidden="true" className="flex items-end gap-px">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`w-[3px] rounded-[1px] bg-current ${n <= bars ? "" : "opacity-20"}`} style={{ height: 4 + n * 2 }} />
        ))}
      </span>
      {CASE_PRIORITY_LABELS[priority]}
    </span>
  );
}
