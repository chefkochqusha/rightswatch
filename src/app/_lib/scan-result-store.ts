import type { ScanResultRepository } from "@/modules/scan-results";
import { PrismaScanResultRepository } from "@/modules/scan-results/prisma-repository";

/**
 * Where a workspace's scan results live: Postgres, so they survive redeploys
 * and are the same on every serverless instance — the Cases, notifications
 * and audit entries that point at them are durable too.
 */
interface ScanResultStore {
  results: ScanResultRepository;
}

const globalForScanResults = globalThis as unknown as { __rightswatchScanResultStore?: ScanResultStore };

export function getScanResultStore(): ScanResultStore {
  if (!globalForScanResults.__rightswatchScanResultStore) {
    globalForScanResults.__rightswatchScanResultStore = { results: new PrismaScanResultRepository() };
  }
  return globalForScanResults.__rightswatchScanResultStore;
}
