/**
 * The top of every workspace page (Brief §29: "Where am I? What can I
 * do?"): the page's name, one line on what it's for, and its main actions
 * on the right. The title is set like the landing page's headings (the
 * display face, extra bold, tight), so the app and the site read as one
 * product; the description stays at reading size.
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
        <h1 className="font-display text-[2.25rem] leading-[1.05] font-extrabold tracking-[-0.03em] text-tx">{title}</h1>
        {description && <p className="mt-2 text-[0.9375rem] leading-normal text-t2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
