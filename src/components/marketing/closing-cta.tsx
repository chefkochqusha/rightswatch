import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DemoButton } from "./demo-button";

/**
 * The closing call to action, after Watermelon UI's cta-1: a blue card with
 * two soft, blurred shapes behind the copy. The shapes are decoration only
 * (aria-hidden) and drawn in CSS, so nothing is loaded from elsewhere.
 */
const SHAPE =
  "polygon(74.8% 41.9%, 97.2% 73.2%, 100% 34.9%, 92.5% 0.4%, 87.5% 0%, 75% 28.6%, 58.5% 54.6%, 50.1% 56.8%, 46.9% 44%, 48.3% 17.4%, 24.7% 53.9%, 0% 27.9%, 11.9% 74.2%, 24.9% 54.1%, 68.6% 100%, 74.8% 41.9%)";

export function ClosingCta() {
  return (
    <section className="mx-auto max-w-[80rem] px-5 py-20 sm:px-8 lg:py-28">
      <div className="relative isolate flex flex-col gap-10 overflow-hidden rounded-[2rem] bg-ultra px-7 py-14 text-white sm:px-12 md:flex-row md:items-end md:justify-between lg:px-16 lg:py-20">
        <div aria-hidden="true" className="absolute top-1/2 left-[-10rem] -z-10 -translate-y-1/2 transform-gpu blur-3xl">
          <div style={{ clipPath: SHAPE }} className="aspect-[577/310] w-[36rem] bg-gradient-to-r from-white to-[#8fa0ff] opacity-25" />
        </div>
        <div aria-hidden="true" className="absolute top-1/3 right-[-14rem] -z-10 -translate-y-1/2 transform-gpu blur-3xl">
          <div style={{ clipPath: SHAPE }} className="aspect-[577/310] w-[36rem] bg-gradient-to-r from-[#00c2ff] to-white opacity-20" />
        </div>

        <div className="max-w-2xl">
          <h2 className="font-display text-[clamp(2.5rem,5.6vw,4.75rem)] leading-[0.97] font-extrabold tracking-[-0.035em]">
            Find out where your songs are being used.
          </h2>
          <p className="mt-5 max-w-lg text-[1.0625rem] leading-relaxed text-white/80">
            Try it free for 14 days, no card needed. Or look around the demo workspace first.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3">
          <Link
            href="/signup"
            className="group inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-base font-medium text-black shadow-[inset_0_2px_4px_rgba(255,255,255,0.5),inset_0_-2px_5px_rgba(0,0,0,0.1),0_8px_20px_rgba(0,0,0,0.15)] transition active:scale-[0.97]"
          >
            Start monitoring
            <ArrowRight className="h-4 w-4 transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
          <DemoButton className="inline-flex h-12 items-center rounded-full px-6 text-base font-medium text-white ring-1 ring-white/50 ring-inset transition hover:bg-white/10 active:scale-[0.97]" />
        </div>
      </div>
    </section>
  );
}
