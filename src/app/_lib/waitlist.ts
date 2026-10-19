import { PrismaWaitlistRepository } from "@/modules/waitlist/prisma-repository";
import type { WaitlistRepository } from "@/modules/waitlist";

export { isWaitlistMode } from "./waitlist-mode";

const globalForWaitlist = globalThis as unknown as { __bekvorWaitlist?: WaitlistRepository };

export function getWaitlistRepository(): WaitlistRepository {
  return (globalForWaitlist.__bekvorWaitlist ??= new PrismaWaitlistRepository());
}
