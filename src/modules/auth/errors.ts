/**
 * A write collided with a unique constraint. Thrown by `AccountRepository`
 * implementations so business logic (`signUp`, `acceptInvite`) can tell a
 * lost race — two signups for the same email or workspace slug landing at
 * once — from a real failure, without importing anything Prisma-specific.
 * `field` is best-effort: `"unknown"` when the store doesn't say which
 * constraint it was, and callers re-check the email to decide.
 */
export class UniqueConstraintError extends Error {
  constructor(readonly field: "email" | "slug" | "unknown") {
    super(`Unique constraint violated (${field})`);
    this.name = "UniqueConstraintError";
  }
}
