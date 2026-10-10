import Link from "next/link";
import { legalDetailsFromEnv } from "@/app/_lib/legal-details";

export const metadata = { title: "Imprint — Bekvor", robots: { index: false } };

const H2 = "mt-10 text-[1.0625rem] font-semibold tracking-[-0.01em] text-tx";

/**
 * Imprint (§ 5 DDG) and the DSA contact points (Art. 11, 12, 16), from the
 * operator's details in the environment (`legal-details.ts`). Draft text for
 * the lawyer: `legal/impressum.md`. No OS-platform link: the platform closed
 * on 20 July 2025.
 */
export default function Page() {
  const d = legalDetailsFromEnv();
  return (
    <div className="mx-auto max-w-2xl px-5 pt-32 pb-24 sm:px-8">
      <h1 className="font-display text-[2.5rem] leading-none font-extrabold tracking-[-0.03em]">Imprint</h1>
      {!d ? (
        <p className="mt-6 leading-relaxed text-t2">
          This page is published before launch. Bekvor is not yet open for customers; the operator&apos;s details follow before it is.
        </p>
      ) : (
        <div className="leading-relaxed text-t2">
          <h2 className={H2}>Information under § 5 DDG</h2>
          <p className="mt-3">
            <span className="text-tx">{d.name}</span>
            {d.address.map((line) => (
              <span key={line}>
                <br />
                {line}
              </span>
            ))}
          </p>
          {d.representative && <p className="mt-3">Represented by: {d.representative}</p>}
          {d.register && <p className="mt-1">Register: {d.register}</p>}

          <h2 className={H2}>Contact</h2>
          <p className="mt-3">
            Email: <a className="text-accent underline underline-offset-2 hover:decoration-2" href={`mailto:${d.email}`}>{d.email}</a>
            <br />
            Phone: <a className="text-accent underline underline-offset-2 hover:decoration-2" href={`tel:${d.phone.replace(/[^+\d]/g, "")}`}>{d.phone}</a>
          </p>

          {d.vatId && (
            <>
              <h2 className={H2}>VAT</h2>
              <p className="mt-3">VAT identification number under § 27a UStG: {d.vatId}</p>
            </>
          )}

          <h2 className={H2}>Contact point under the Digital Services Act</h2>
          <p className="mt-3">
            Single point of contact for authorities of the Member States, the European Commission and the Board, and for users (Art. 11 and 12 DSA):{" "}
            <a className="text-accent underline underline-offset-2 hover:decoration-2" href={`mailto:${d.dsaEmail}`}>{d.dsaEmail}</a>. We communicate in German and
            English.
          </p>
          <p className="mt-3">
            To report illegal content in an uploaded file (Art. 16 DSA), write to the same address and include: why you consider the content illegal;
            where it is (workspace, song or post); your name and email address; and a statement that you believe in good faith that the report is
            accurate and complete.
          </p>

          <h2 className={H2}>Consumer dispute resolution</h2>
          <p className="mt-3">
            Bekvor is offered to businesses only. We are neither willing nor obliged to take part in dispute resolution proceedings before a consumer
            arbitration board.
          </p>

          <p className="mt-10 text-[0.875rem]">
            How we handle personal data: <Link className="text-accent underline underline-offset-2 hover:decoration-2" href="/privacy">Privacy</Link>.
          </p>
        </div>
      )}
    </div>
  );
}

// The footer's "Try the demo" Server Action fills the demo workspace on the first visit,
// which takes longer than the default limit.
export const maxDuration = 120;
