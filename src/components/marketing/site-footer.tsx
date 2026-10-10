"use client";

import Link from "next/link";
import { motion, type Variants } from "motion/react";
import { BRAND } from "@/lib/brand";
import { LogoMark } from "@/components/brand/logo-mark";
import { DemoButton } from "./demo-button";

/**
 * The public site's footer, after Watermelon UI's footer-20: brand and a short
 * statement on the left, link columns on the right, the name set large at the
 * bottom. The legal pages are linked from every page (§ 5 DDG, Art. 13 GDPR).
 * Reduced motion: see MotionProvider.
 */
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const rise: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", duration: 0.6, bounce: 0 } },
};

/** The name is stretched to the full width; the width follows its length so a name of any length keeps the same letter shapes. */
const NAME_WIDTH = BRAND.name.length * 91;

const linkClass = "text-[0.9375rem] text-t2 transition-colors hover:text-tx";

export function SiteFooter() {
  return (
    <motion.footer variants={container} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }} className="relative overflow-hidden border-t border-line bg-surface-2">
      <div className="mx-auto flex max-w-[80rem] flex-col px-5 pt-16 sm:px-8 lg:pt-24">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-8">
          <motion.div variants={rise} className="lg:col-span-5">
            <p className="flex items-center gap-2.5 text-[0.9375rem] font-semibold">
              <LogoMark />
              {BRAND.name}
            </p>
            <p className="mt-5 max-w-xs text-[0.875rem] leading-relaxed text-t2">
              {BRAND.name} flags potential rights mismatches for a person to review. It doesn&apos;t make legal determinations.
            </p>
          </motion.div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-7">
            <motion.div variants={rise}>
              <p className="text-sm font-medium">Product</p>
              <ul className="mt-4 space-y-2.5">
                <li><Link href="/#how" className={linkClass}>How it works</Link></li>
                <li><Link href="/#pricing" className={linkClass}>Pricing</Link></li>
                <li><DemoButton className={`${linkClass} text-left`}>Demo</DemoButton></li>
              </ul>
            </motion.div>
            <motion.div variants={rise}>
              <p className="text-sm font-medium">Account</p>
              <ul className="mt-4 space-y-2.5">
                <li><Link href="/login" className={linkClass}>Log in</Link></li>
                <li><Link href="/signup" className={linkClass}>Sign up</Link></li>
                <li><Link href="/partner-terms" className={linkClass}>Partner programme</Link></li>
              </ul>
            </motion.div>
            <motion.div variants={rise}>
              <p className="text-sm font-medium">Legal</p>
              <ul className="mt-4 space-y-2.5">
                <li><Link href="/imprint" className={linkClass}>Imprint</Link></li>
                <li><Link href="/privacy" className={linkClass}>Privacy</Link></li>
              </ul>
            </motion.div>
          </nav>
        </div>

        <motion.div variants={rise} aria-hidden="true" className="mt-16 select-none lg:mt-24">
          <svg className="block h-auto w-full" style={{ maxWidth: `${(NAME_WIDTH / 1000) * 100}%` }} viewBox={`0 18 ${NAME_WIDTH} 120`} preserveAspectRatio="xMidYMax meet">
            <defs>
              <linearGradient id="footer-name" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1f3dff" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#1f3dff" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <text x="0" y="138" textLength={NAME_WIDTH} lengthAdjust="spacingAndGlyphs" fill="url(#footer-name)" fontSize="170" fontWeight="800" className="font-display tracking-[-0.04em]">
              {BRAND.name}
            </text>
          </svg>
        </motion.div>
      </div>
    </motion.footer>
  );
}
