"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ENTERPRISE_OFFER, PLAN_CATALOG } from "@/modules/billing/plan-catalog";
import { LOYALTY, annualPriceCents, monthOfMaxDiscount, monthlyPriceCents } from "@/modules/billing/loyalty";

const whole = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
const eur = (c: number) => (c % 100 === 0 ? whole : cents).format(c / 100);

const CADENCE: Record<string, string> = {
  daily: "Scans every day",
  every_6h: "Scans every 6 hours",
  configurable: "Scan schedule you set",
};
const SHARED = ["Song recognition from post audio", "Cases, notes and audit log"];
const n = (value: number) => value.toLocaleString("en-US");
const POPULAR = "GROWTH";

/**
 * Pricing, after Watermelon UI's pricing-5: a monthly/yearly switch, four
 * self-serve plans (Growth highlighted) and Enterprise on request. Every
 * number comes from the plan catalog and the loyalty rules (`modules/billing`),
 * so the page can't drift from what the app charges. `terms` is the legal
 * line shown under the plans; `salesEmail` the Enterprise contact, if set.
 */
export function Pricing({ terms, salesEmail }: { terms: React.ReactNode; salesEmail?: string | null }) {
  const [yearly, setYearly] = useState(false);
  const id = useId();
  const maxMonth = monthOfMaxDiscount();

  return (
    <section id="pricing" className="scroll-mt-8">
      <div className="mx-auto max-w-[80rem] px-5 py-24 sm:px-8 lg:py-32">
        <h2 className="font-display text-[clamp(2.25rem,4.4vw,3.75rem)] leading-[1] font-extrabold tracking-[-0.03em]">
          Priced by how many creators you watch.
        </h2>
        <p className="mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-t2">
          Every plan gets cheaper the longer you stay. Try any of them free for 14 days, no card needed.
        </p>

        <div className="mt-10 flex items-center gap-3">
          <label htmlFor={id} className={`cursor-pointer text-sm font-medium ${yearly ? "text-t2" : "text-tx"}`}>
            Monthly
          </label>
          <Switch id={id} checked={yearly} onCheckedChange={setYearly} label="Bill yearly" />
          <label htmlFor={id} className={`cursor-pointer text-sm font-medium ${yearly ? "text-tx" : "text-t2"}`}>
            Yearly <span className="ml-1 rounded-full bg-cleared-bg px-2 py-0.5 text-xs text-cleared">−{LOYALTY.annualPercent} %</span>
          </label>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {PLAN_CATALOG.map((plan) => {
            const popular = plan.tier === POPULAR;
            return (
              <div
                key={plan.id}
                className={`flex flex-col rounded-[2rem] p-2 sm:p-2.5 ${popular ? "bg-ultra" : "bg-surface-2 shadow-[inset_0_0_0_1px_var(--ln)]"}`}
              >
                <div className="mt-3 mb-4 flex items-center justify-between px-4">
                  <h3 className={`font-display text-xl font-bold tracking-[-0.02em] ${popular ? "text-white" : ""}`}>{plan.name}</h3>
                  {popular && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white">Most chosen</span>}
                </div>
                <div className="flex flex-1 flex-col rounded-[1.6rem] bg-surface p-6 shadow-[0_0_0_0.5px_rgba(0,0,0,0.06),0_2px_4px_rgba(0,0,0,0.06)] sm:p-7">
                  <p className="font-display text-[2.75rem] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
                    {yearly ? eur(annualPriceCents(plan)) : eur(plan.priceCents)}
                    <span className="ml-1.5 font-sans text-base font-normal tracking-normal text-t2">{yearly ? "a year" : "a month"}</span>
                  </p>
                  <p className="mt-2 text-[0.875rem] text-t2">
                    {yearly
                      ? `${eur(monthlyPriceCents(plan, "ANNUAL", 1))} a month, billed yearly`
                      : `${eur(monthlyPriceCents(plan, "MONTHLY", maxMonth))} a month from month ${maxMonth}`}
                  </p>
                  <ul className="mt-7 flex-1 space-y-3 text-[0.9375rem]">
                    {[
                      `Up to ${n(plan.creatorCap)} creators`,
                      CADENCE[plan.scanCadence] ?? plan.scanCadence,
                      `${n(plan.referenceSongCap)} songs with reference audio`,
                      plan.seatCap === 1 ? "1 seat" : `${n(plan.seatCap)} team seats`,
                      ...SHARED,
                    ].map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <Check className={`mt-0.5 h-4 w-4 shrink-0 ${popular ? "text-ultra" : "text-t2"}`} aria-hidden="true" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/signup"
                    className={`mt-8 inline-flex h-12 items-center justify-center rounded-xl text-base font-semibold transition active:scale-[0.98] ${
                      popular ? "bg-ultra text-white hover:opacity-90" : "border border-line bg-surface-2 text-tx hover:bg-hover"
                    }`}
                  >
                    Start free trial
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex flex-col gap-6 rounded-[2rem] bg-tx p-7 text-bg sm:p-9 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h3 className="font-display text-2xl font-bold tracking-[-0.02em]">{ENTERPRISE_OFFER.name}</h3>
            <p className="mt-1 text-[0.9375rem] opacity-80">For labels, publishers and distributors with large catalogues. From {eur(ENTERPRISE_OFFER.fromPriceCents)} a month.</p>
            <ul className="mt-5 grid gap-2.5 text-[0.9375rem] sm:grid-cols-2">
              {ENTERPRISE_OFFER.points.map((point) => (
                <li key={point} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          {salesEmail ? (
            <a
              href={`mailto:${salesEmail}?subject=${encodeURIComponent("Bekvor Enterprise")}`}
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-bg px-6 text-base font-semibold text-tx transition hover:opacity-90 active:scale-[0.98]"
            >
              Talk to us
            </a>
          ) : (
            <p className="shrink-0 text-[0.9375rem] opacity-80">Start with Agency; we move you over when you need more.</p>
          )}
        </div>
        <div className="mt-6 max-w-3xl text-[0.9375rem] leading-relaxed text-t2">{terms}</div>
      </div>
    </section>
  );
}
