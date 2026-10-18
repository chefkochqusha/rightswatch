import { getPrisma } from "@/lib/prisma-client";
import type { NewWaitlistEntry, WaitlistEntry, WaitlistRepository } from "./types";

export class PrismaWaitlistRepository implements WaitlistRepository {
  async findByEmail(email: string): Promise<WaitlistEntry | null> {
    return getPrisma().waitlistEntry.findUnique({ where: { email } });
  }
  async findByTokenHash(tokenHash: string): Promise<WaitlistEntry | null> {
    return getPrisma().waitlistEntry.findUnique({ where: { tokenHash } });
  }
  async create(entry: NewWaitlistEntry): Promise<WaitlistEntry> {
    return getPrisma().waitlistEntry.create({ data: entry });
  }
  async update(id: string, changes: Parameters<WaitlistRepository["update"]>[1]): Promise<WaitlistEntry> {
    return getPrisma().waitlistEntry.update({ where: { id }, data: changes });
  }
  async delete(id: string): Promise<void> {
    await getPrisma().waitlistEntry.deleteMany({ where: { id } });
  }
  async deleteUnconfirmedBefore(before: Date): Promise<number> {
    const { count } = await getPrisma().waitlistEntry.deleteMany({ where: { confirmedAt: null, confirmationSentAt: { lt: before } } });
    return count;
  }
  async listConfirmed(): Promise<WaitlistEntry[]> {
    return getPrisma().waitlistEntry.findMany({ where: { confirmedAt: { not: null } }, orderBy: { confirmedAt: "asc" } });
  }
}
