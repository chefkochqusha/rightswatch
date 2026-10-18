export type { NewWaitlistEntry, WaitlistEntry, WaitlistRepository } from "./types";
export { CONFIRMATION_TTL_MS, WAITLIST_CONSENT, confirmWaitlist, hashToken, joinWaitlist, leaveWaitlist } from "./waitlist";
export type { JoinDependencies, JoinError, JoinInput, JoinResult, TokenResult } from "./waitlist";
export { InMemoryWaitlistRepository } from "./in-memory-repository";
// The Prisma repository is imported from "@/modules/waitlist/prisma-repository" (it pulls in the database client).
