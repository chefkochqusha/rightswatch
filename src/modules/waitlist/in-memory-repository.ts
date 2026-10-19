import { randomUUID } from "node:crypto";
import type { NewWaitlistEntry, WaitlistEntry, WaitlistRepository } from "./types";

/** The same contract as the Postgres repository, for tests. */
export class InMemoryWaitlistRepository implements WaitlistRepository {
  readonly entries = new Map<string, WaitlistEntry>();

  async findByEmail(email: string) {
    return [...this.entries.values()].find((e) => e.email === email) ?? null;
  }
  async findByTokenHash(tokenHash: string) {
    return [...this.entries.values()].find((e) => e.tokenHash === tokenHash || e.inviteTokenHash === tokenHash) ?? null;
  }
  async create(entry: NewWaitlistEntry) {
    const row: WaitlistEntry = { ...entry, id: randomUUID(), createdAt: entry.confirmationSentAt, confirmedAt: null, invitedAt: null, inviteTemplate: null, inviteTokenHash: null };
    this.entries.set(row.id, row);
    return { ...row };
  }
  async update(id: string, changes: Partial<WaitlistEntry>) {
    const row = { ...this.entries.get(id)!, ...changes };
    this.entries.set(id, row);
    return { ...row };
  }
  async delete(id: string) {
    this.entries.delete(id);
  }
  async deleteByEmail(email: string) {
    for (const [id, e] of this.entries) if (e.email === email) this.entries.delete(id);
  }
  async deleteUnconfirmedBefore(before: Date) {
    let count = 0;
    for (const [id, e] of this.entries) {
      if (!e.confirmedAt && e.confirmationSentAt < before) {
        this.entries.delete(id);
        count++;
      }
    }
    return count;
  }
  async listConfirmed() {
    return [...this.entries.values()].filter((e) => e.confirmedAt).sort((a, b) => a.confirmedAt!.getTime() - b.confirmedAt!.getTime());
  }
}
