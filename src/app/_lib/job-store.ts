import type { JobQueue, JobRepository } from "@/modules/jobs";
import { PrismaJobRepository } from "@/modules/jobs/prisma-repository";

/** Job records (Brief §21), in Postgres. */
interface JobStore {
  jobs: JobRepository;
  /** The same table, used as the background job queue. */
  queue: JobQueue;
}

const globalForJobs = globalThis as unknown as { __rightswatchJobStore?: JobStore };

export function getJobStore(): JobStore {
  if (!globalForJobs.__rightswatchJobStore) {
    const repository = new PrismaJobRepository();
    globalForJobs.__rightswatchJobStore = { jobs: repository, queue: repository };
  }
  return globalForJobs.__rightswatchJobStore;
}
