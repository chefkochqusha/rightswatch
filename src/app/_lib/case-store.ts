import { InMemoryCaseRepository, InMemoryCaseNoteRepository } from "@/modules/cases";
import type { CaseNoteRepository, CaseRepository } from "@/modules/cases";

/**
 * One shared Case/CaseNote store per server process — deliberately still
 * in-memory, even though `PrismaCaseRepository` exists and every sibling
 * store (`auth`, `billing`, `notifications`, `audit`) is Prisma-backed.
 *
 * Why: `Case.rightsAssessmentId` is a foreign key to `RightsAssessment.id`
 * in `prisma/schema.prisma`, not just a `@unique` string, and nothing in
 * this app writes `RightsAssessment` rows yet — the sample scan's results
 * live only in `workspace-scan-store.ts`'s process memory, and the case key
 * it hands `openCase` (`getRightsAssessmentId`) is a synthetic
 * `workspaceId::contentId` string no `rights_assessments` row carries.
 * Pointing this store at Postgres (done once, in 6b69b95) made every
 * "Run a sample scan" / "Open a case" fail with a foreign-key violation in
 * production. Reverted until the scan pipeline persists its own
 * `Content → CommercialContent → MusicMatch → RightsAssessment` chain, at
 * which point a Case can reference a real row and this becomes the
 * one-line swap to `PrismaCaseRepository` it was meant to be.
 *
 * Typed to the interfaces, not the concrete classes, so that swap stays a
 * one-line change here and nowhere else.
 */
interface CaseStore {
  cases: CaseRepository;
  notes: CaseNoteRepository;
}

const globalForCases = globalThis as unknown as { __rightswatchCaseStore?: CaseStore };

export function getCaseStore(): CaseStore {
  if (!globalForCases.__rightswatchCaseStore) {
    globalForCases.__rightswatchCaseStore = {
      cases: new InMemoryCaseRepository(),
      notes: new InMemoryCaseNoteRepository(),
    };
  }
  return globalForCases.__rightswatchCaseStore;
}
