/**
 * "Trusted by": customer names or logos, after Watermelon UI's hero-40 logo row.
 * Only real customers who agreed in writing go here. Showing companies that
 * aren't customers, or logos without permission, is misleading advertising
 * (UWG) and a trademark problem. Empty list: the row isn't rendered at all.
 */
const TRUSTED_BY: readonly { name: string }[] = [];

export function TrustedBy() {
  if (TRUSTED_BY.length === 0) return null;
  return (
    <section aria-label="Customers" className="mx-auto max-w-[80rem] px-5 pb-12 sm:px-8">
      <p className="text-xs font-medium tracking-[0.09em] text-t2 uppercase">Trusted by</p>
      <ul className="mt-5 flex flex-wrap items-center gap-x-12 gap-y-4">
        {TRUSTED_BY.map((c) => (
          <li key={c.name} className="font-display text-lg font-bold tracking-[-0.02em] text-t2">
            {c.name}
          </li>
        ))}
      </ul>
    </section>
  );
}
