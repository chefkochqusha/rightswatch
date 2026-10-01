/**
 * An intentional empty section (Brief §36): say plainly what isn't there
 * yet, and offer the action that fills it. No illustration, no joke.
 */
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-14 text-center">
      <h2 className="text-[1.0625rem] font-semibold tracking-[-0.01em] text-tx">{title}</h2>
      {description && <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-t2">{description}</p>}
      {children && <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}
