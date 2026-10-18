/**
 * The waitlist (`LEGAL_DE.md`, "Waitlist"): businesses leave an address to be
 * told when their access is ready. Double opt-in: an entry counts only once
 * the address owner clicked the link in the confirmation email. Every entry
 * keeps the proof the courts ask for: the consent wording as shown, when it was
 * given, which confirmation email went out and when it was confirmed.
 */
export interface WaitlistEntry {
  id: string;
  /** Lowercased. */
  email: string;
  company: string | null;
  /** The checkbox text exactly as the person saw it, and its version. */
  consentText: string;
  consentVersion: string;
  /** SHA-256 of the secret in the confirm and leave links; the secret itself is never stored. */
  tokenHash: string;
  /** Which confirmation email template was sent (its version), and when. */
  confirmationTemplate: string;
  confirmationSentAt: Date;
  confirmedAt: Date | null;
  createdAt: Date;
}

export type NewWaitlistEntry = Omit<WaitlistEntry, "id" | "createdAt" | "confirmedAt">;

export interface WaitlistRepository {
  findByEmail(email: string): Promise<WaitlistEntry | null>;
  findByTokenHash(tokenHash: string): Promise<WaitlistEntry | null>;
  create(entry: NewWaitlistEntry): Promise<WaitlistEntry>;
  update(id: string, changes: Partial<Pick<WaitlistEntry, "tokenHash" | "confirmationSentAt" | "confirmationTemplate" | "consentText" | "consentVersion" | "company" | "confirmedAt">>): Promise<WaitlistEntry>;
  delete(id: string): Promise<void>;
  /** Removes entries never confirmed whose confirmation email is older than `before`. Returns how many. */
  deleteUnconfirmedBefore(before: Date): Promise<number>;
  /** Confirmed entries, oldest first: the list to invite from. */
  listConfirmed(): Promise<WaitlistEntry[]>;
}
