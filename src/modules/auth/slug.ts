/**
 * Workspace slugs (Brief §43: `Workspace.slug` is `@unique`). `slugify` is
 * pure and deterministic on purpose so it needs no repository to test.
 * Uniqueness against existing data is necessarily the caller's job — only
 * the caller holds a `WorkspaceRepository` — which is what
 * `generateUniqueSlug` takes an `isTaken` check for.
 */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "workspace";
}

const MAX_ATTEMPTS = 1000;

/**
 * Appends `-2`, `-3`, ... to the base slug until `isTaken` reports the
 * candidate is free. Bounded so a repository that (incorrectly) always
 * reports "taken" can't spin this forever.
 */
export async function generateUniqueSlug(
  name: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  while (await isTaken(candidate)) {
    if (suffix > MAX_ATTEMPTS) {
      throw new Error(
        `Could not find a unique slug for "${name}" after ${MAX_ATTEMPTS} attempts.`,
      );
    }
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
