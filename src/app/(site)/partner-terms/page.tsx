import { PARTNER_PROGRAMME } from "@/modules/referrals";

export const metadata = { title: "Partner terms — Bekvor", robots: { index: false } };

/**
 * Draft of the partner programme terms: the rules the product enforces and the
 * ones partners must follow. To be reviewed by a lawyer before launch
 * (RELEASE_CHECKLIST.md); the operator's details come with the imprint.
 */
export default function Page() {
  const { commissionPercent, commissionMonths } = PARTNER_PROGRAMME;
  return (
    <div className="mx-auto max-w-2xl px-5 pt-32 pb-24 sm:px-8">
      <h1 className="font-display text-[2.5rem] leading-none font-extrabold tracking-[-0.03em]">Partner terms</h1>
      <p className="mt-4 text-[0.875rem] text-t2">Draft, published before launch. The final terms are reviewed by a lawyer.</p>
      <ol className="mt-8 list-decimal space-y-4 pl-5 leading-relaxed text-t2">
        <li>
          <strong className="text-tx">Commission.</strong> For every business that creates a workspace through your partner link, you earn{" "}
          {commissionPercent} % of each invoice it pays (net of tax) during its first {commissionMonths} months. Refunded or charged-back invoices earn
          nothing; a commission already paid out for them is set off against later ones.
        </li>
        <li>
          <strong className="text-tx">Your own workspace doesn&apos;t count.</strong> Referring yourself, your own company or accounts you control
          earns no commission.
        </li>
        <li>
          <strong className="text-tx">Label it as advertising.</strong> Wherever you share the link (posts, videos, stories, newsletters), mark it
          clearly as advertising, for example with &ldquo;Werbung&rdquo; or &ldquo;Anzeige&rdquo;. Don&apos;t present Bekvor as an independent test
          or review.
        </li>
        <li>
          <strong className="text-tx">No spam.</strong> No unsolicited emails, messages or texts, no paid search ads on the Bekvor name, no
          misleading claims about what the product does.
        </li>
        <li>
          <strong className="text-tx">Payout.</strong> Commissions are paid monthly by bank transfer once they reach €50, against an invoice or credit
          note with your tax details. You are responsible for declaring them for tax.
        </li>
        <li>
          <strong className="text-tx">Ending.</strong> Either side can end the partnership at any time. Breaking these terms ends it immediately and
          cancels commissions that are not yet paid out.
        </li>
      </ol>
      <p className="mt-8 text-[0.875rem] text-t2">The link carries a code in the address only. Bekvor sets no tracking cookie for it.</p>
    </div>
  );
}
