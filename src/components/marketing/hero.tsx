"use client";

import { motion, type Variants } from "motion/react";

/**
 * The landing hero, after Watermelon UI's hero-40: a slow-blooming light orb
 * behind the copy and a headline whose lines rise in one after another. The orb
 * is drawn with CSS gradients in the brand blue (no third-party image, so no
 * request leaves the site). Server-rendered parts come in as props.
 */
const lines: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.14, delayChildren: 0.15 } },
};
const line: Variants = {
  hidden: { opacity: 0, y: 44, filter: "blur(14px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", damping: 28, stiffness: 80, mass: 1.2 } },
};
const after = (delay: number): Variants => ({
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", damping: 26, stiffness: 100, delay } },
});

export function Hero({ actions, aside }: { actions: React.ReactNode; aside: React.ReactNode }) {
  const initial = "hidden";

  return (
    <section className="relative isolate overflow-hidden">
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        initial={{ opacity: 0, scale: 1.08 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 2, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="absolute top-[-18rem] right-[-12rem] h-[44rem] w-[44rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(31,61,255,0.28),rgba(31,61,255,0.08)_45%,transparent_70%)] blur-2xl" />
        <div className="absolute top-[14rem] left-[-16rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(0,104,208,0.16),transparent_65%)] blur-2xl" />
      </motion.div>

      <div className="mx-auto grid max-w-[80rem] items-center gap-12 px-5 pt-32 pb-16 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:gap-6 lg:pt-36 lg:pb-24">
        <div>
          <motion.h1
            variants={lines}
            initial={initial}
            animate="show"
            className="font-display text-[clamp(3rem,6.2vw,5.75rem)] leading-[0.95] font-extrabold tracking-[-0.035em]"
          >
            <motion.span variants={line} className="block">
              Know where your music
            </motion.span>
            <motion.span variants={line} className="block text-ultra">
              appears commercially.
            </motion.span>
          </motion.h1>
          <motion.p variants={after(0.55)} initial={initial} animate="show" className="mt-7 max-w-[34rem] text-[1.1875rem] leading-relaxed text-t2">
            We watch the paid posts of the TikTok creators you follow, hear which of your songs are in them, and check each one against your licences.
            You review what doesn&apos;t add up.
          </motion.p>
          <motion.div variants={after(0.75)} initial={initial} animate="show" className="mt-9 flex flex-wrap items-center gap-3">
            {actions}
          </motion.div>
        </div>
        <motion.div variants={after(0.45)} initial={initial} animate="show">
          {aside}
        </motion.div>
      </div>
    </section>
  );
}
