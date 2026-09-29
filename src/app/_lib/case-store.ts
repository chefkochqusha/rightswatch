import { InMemoryCaseRepository, InMemoryCaseNoteRepository } from "@/modules/cases";

/**
 * One shared in-memory Case/CaseNote store per server process — same
 * rationale and same caveats as `auth-store.ts` and
 * `workspace-scan-store.ts` (Prisma-backed later, cached on `globalThis`
 * for `next dev`, not for production).
 */
interface CaseStore {
  cases: InMemoryCaseRepository;
  notes: InMemoryCaseNoteRepository;
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
