export const metadata = { title: "Imprint — RightsWatch", robots: { index: false } };

/** Placeholder until launch: the legal text needs the operator's company details and a legal review (RELEASE_CHECKLIST.md). */
export default function Page() {
  return (
    <div className="mx-auto max-w-2xl px-5 pt-32 pb-24 sm:px-8">
      <h1 className="font-display text-[2.5rem] leading-none font-extrabold tracking-[-0.03em]">Imprint</h1>
      <p className="mt-6 leading-relaxed text-t2">
        This page is published before launch. RightsWatch is not yet open for customers.
      </p>
    </div>
  );
}

// The footer's "Try the demo" Server Action fills the demo workspace on the first visit,
// which takes longer than the default limit.
export const maxDuration = 120;
