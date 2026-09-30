export type {
  CaseStatus,
  CaseRecord,
  CaseNoteRecord,
  CaseRepository,
  CaseNoteRepository,
} from "./types";

export { InMemoryCaseRepository, InMemoryCaseNoteRepository } from "./in-memory-repositories";

// `PrismaCaseRepository`/`PrismaCaseNoteRepository` are deliberately NOT
// re-exported here — same reasoning as `modules/audit/index.ts`: they
// transitively import `@/lib/prisma-client`, and this barrel is used by
// every in-memory-only consumer (including this module's own tests).
// Import them directly from "@/modules/cases/prisma-repositories" — and
// read that file's doc comment first: they aren't wired in yet, because a
// `Case` needs a persisted `RightsAssessment` row to point at.

export { openCase } from "./open-case";
export type { OpenCaseInput, OpenCaseDependencies, OpenCaseResult } from "./open-case";

export { addCaseNote } from "./add-case-note";
export type { AddCaseNoteInput, AddCaseNoteDependencies, AddCaseNoteResult } from "./add-case-note";

export { updateCase } from "./update-case";
export type { UpdateCaseInput, UpdateCaseDependencies, UpdateCaseResult } from "./update-case";
