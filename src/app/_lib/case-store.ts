import type { CaseNoteRepository, CaseRepository } from "@/modules/cases";
import { PrismaCaseNoteRepository, PrismaCaseRepository } from "@/modules/cases/prisma-repositories";

/**
 * One shared Case/CaseNote store per server process, in Postgres.
 *
 * This was the one-line swap it was meant to be only once the scan pipeline
 * stored its own results: `Case.rightsAssessmentId` is a foreign key to
 * `RightsAssessment.id`, and a first attempt (6b69b95) pointed this store at
 * Postgres while assessments still lived in memory under a synthetic id —
 * every case creation failed in production until it was reverted. Cases now
 * point at the real `RightsAssessment` rows `modules/scan-results` writes.
 */
interface CaseStore {
  cases: CaseRepository;
  notes: CaseNoteRepository;
}

const globalForCases = globalThis as unknown as { __rightswatchCaseStore?: CaseStore };

export function getCaseStore(): CaseStore {
  if (!globalForCases.__rightswatchCaseStore) {
    globalForCases.__rightswatchCaseStore = {
      cases: new PrismaCaseRepository(),
      notes: new PrismaCaseNoteRepository(),
    };
  }
  return globalForCases.__rightswatchCaseStore;
}
