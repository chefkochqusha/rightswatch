import { PrismaCaseRepository, PrismaCaseNoteRepository } from "@/modules/cases/prisma-repositories";

/**
 * One shared Case/CaseNote store per server process. Prisma-backed as of
 * Phase 2 (Neon is live) — same rationale as `auth-store.ts` for why nothing
 * else needed to change: `openCase`/`addCaseNote`/`updateCase` all depend
 * only on the `CaseRepository`/`CaseNoteRepository` interfaces in
 * `modules/cases/types.ts`, never a concrete implementation.
 */
interface CaseStore {
  cases: PrismaCaseRepository;
  notes: PrismaCaseNoteRepository;
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
