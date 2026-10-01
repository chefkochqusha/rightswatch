export type { JobChanges, JobRecord, JobRepository, JobStatus, NewJob } from "./types";
export { InMemoryJobRepository } from "./in-memory-repository";
// `PrismaJobRepository`: import from "@/modules/jobs/prisma-repository" —
// kept out of this barrel for the same reason as every other module's.

export { SCAN_JOB_TYPE, creatorScanHistory, emptyScanPayload } from "./scan-job";
export type { CreatorScanHistoryEntry, ScanJobCreatorResult, ScanJobPayload } from "./scan-job";
