export type { ScanItemInput, StoredScanItem, ScanResultRepository } from "./types";
export { IDENTIFICATION_NOT_COMPLETED } from "./types";
export { InMemoryScanResultRepository } from "./in-memory-repository";

// `PrismaScanResultRepository` is deliberately NOT re-exported here — same
// reasoning as every other module's barrel: it transitively imports
// `@/lib/prisma-client`, and in-memory-only consumers (this module's own
// tests included) import this barrel. Import it directly from
// "@/modules/scan-results/prisma-repository", as `app/_lib/scan-result-store.ts` does.
