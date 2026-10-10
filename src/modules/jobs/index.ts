export type { JobChanges, JobQueue, JobRecord, JobRepository, JobStatus, NewJob, QueuedJobInput } from "./types";
export { INLINE_STALE_MS } from "./types";
export { PermanentJobError, processNextJob, retryDelayMs } from "./worker";
export type { JobHandler, JobStepResult } from "./worker";
export { InMemoryJobRepository } from "./in-memory-repository";
// `PrismaJobRepository`: import from "@/modules/jobs/prisma-repository" —
// kept out of this barrel for the same reason as every other module's.

export { isScanDue, scanIntervalMs } from "./schedule";
export { runDueScansFor } from "./due-scans";
export type { DueScanSummary } from "./due-scans";
export { SCAN_JOB_TYPE, creatorScanHistory, emptyScanPayload } from "./scan-job";
export type { CreatorScanHistoryEntry, ScanJobCreatorResult, ScanJobPayload } from "./scan-job";
