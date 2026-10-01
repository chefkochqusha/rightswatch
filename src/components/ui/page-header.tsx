/**
 * The top of every workspace page (Brief §29: "Where am I? What can I
 * do?"): the page's name, one line on what it's for, and its main actions
 * on the right. Large type sits tight — 2rem at 1.1 leading and -0.02em
 * tracking (Brief §28) — and the description stays at reading size.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 max-w-2xl">
        <h1 className="text-[2rem] leading-[1.1] font-semibold tracking-[-0.02em] text-tx">{title}</h1>
        {description && <p className="mt-2 text-[0.9375rem] leading-normal text-t2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
