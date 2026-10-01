import type { JobRepository } from "@/modules/jobs";
import { PrismaJobRepository } from "@/modules/jobs/prisma-repository";

/** Job records (Brief §21), in Postgres. */
interface JobStore {
  jobs: JobRepository;
}

const globalForJobs = globalThis as unknown as { __rightswatchJobStore?: JobStore };

export function getJobStore(): JobStore {
  if (!globalForJobs.__rightswatchJobStore) {
    globalForJobs.__rightswatchJobStore = { jobs: new PrismaJobRepository() };
  }
  return globalForJobs.__rightswatchJobStore;
}
