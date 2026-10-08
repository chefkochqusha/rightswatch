"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Bell, Download, History, Inbox } from "lucide-react";

/**
 * What happens after a check, as a bento grid (after Watermelon UI's bento-02):
 * cases, notifications, the audit log and exports. Hovering a card plays a
 * small animation of what it does; reduced motion keeps everything still.
 */
const cardClass =
  "group relative flex flex-col overflow-hidden rounded-2xl bg-surface p-5 lg:p-6 shadow-[inset_0_0_0_1px_var(--ln),0_1px_2px_rgba(0,0,0,0.04),0_2px_4px_rgba(0,0,0,0.04)]";

const CASES = [
  { who: "@maxstudio", song: "Golden Hour", state: "Open", tone: "bg-review-bg text-review" },
  { who: "@lena.creates", song: "Midnight Run", state: "Waiting", tone: "bg-unknown-bg text-unknown" },
  { who: "@theurbanedit", song: "Northern Lights", state: "Resolved", tone: "bg-cleared-bg text-cleared" },
] as const;

export function Bento() {
  const [hovered, setHovered] = useState<number | null>(null);
  const reduce = useReducedMotion();
  const on = (i: number) => ({ onMouseEnter: () => setHovered(i), onMouseLeave: () => setHovered(null) });

  return (
    <section>
      <div className="mx-auto max-w-[80rem] px-5 py-24 sm:px-8 lg:py-32">
        <h2 className="max-w-3xl font-display text-[clamp(2.25rem,4.4vw,3.75rem)] leading-[1] font-extrabold tracking-[-0.03em]">
          A mismatch becomes work your team can finish.
        </h2>
        <p className="mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-t2">
          Anything that isn&apos;t cleared opens a case with the post, the song, the verdict and the reason attached.
        </p>

        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className={`${cardClass} min-h-[20rem] md:col-span-2`} {...on(1)}>
            <div className="flex items-center gap-2 text-[0.8125rem] text-t2">
              <Inbox className="h-4 w-4" aria-hidden="true" /> Cases
            </div>
            <ul className="mt-5 space-y-2.5">
              {CASES.map((c, i) => (
                <motion.li
                  key={c.who}
                  className="flex items-center justify-between gap-4 rounded-xl border border-line bg-bg px-4 py-3"
                  animate={!reduce && hovered === 1 ? { x: [0, 6, 0] } : { x: 0 }}
                  transition={{ duration: 0.6, delay: i * 0.08 }}
                >
                  <span className="min-w-0 truncate text-[0.9375rem]">
                    <span className="font-medium">{c.who}</span> <span className="text-t2">· {c.song}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.tone}`}>{c.state}</span>
                </motion.li>
              ))}
            </ul>
            <div className="mt-auto pt-6">
              <h3 className="text-xl font-semibold tracking-[-0.01em]">Cases with everything attached</h3>
              <p className="mt-1.5 max-w-md text-[0.9375rem] text-t2">
                Assign, prioritise, add notes. Fix a rights record and the post is checked again; the case stays with it.
              </p>
            </div>
          </div>

          <div className={`${cardClass} min-h-[20rem]`} {...on(2)}>
            <h3 className="text-xl font-semibold tracking-[-0.01em]">Your team hears about it</h3>
            <p className="mt-1.5 text-[0.9375rem] text-t2">A notification for every new case, for the people who should know.</p>
            <div className="mt-auto flex justify-center pt-8">
              <motion.span
                className="grid h-20 w-20 place-items-center rounded-3xl bg-ultra text-white shadow-[0_12px_30px_rgba(31,61,255,0.35)]"
                animate={!reduce && hovered === 2 ? { rotate: [0, -12, 10, -6, 0] } : { rotate: 0 }}
                transition={{ duration: 0.8 }}
              >
                <Bell className="h-9 w-9" aria-hidden="true" />
              </motion.span>
            </div>
          </div>

          <div className={`${cardClass} min-h-[16rem]`} {...on(3)}>
            <h3 className="text-xl font-semibold tracking-[-0.01em]">Who did what, when</h3>
            <p className="mt-1.5 text-[0.9375rem] text-t2">Every change, login and download is kept in an audit log.</p>
            <ul className="mt-auto space-y-1.5 pt-6 text-[0.8125rem] text-t2">
              {["Opened a case", "Changed the case status", "Downloaded workspace data"].map((line, i) => (
                <motion.li
                  key={line}
                  className="flex items-center gap-2"
                  animate={!reduce && hovered === 3 ? { opacity: [0.4, 1] } : { opacity: 1 }}
                  transition={{ duration: 0.4, delay: i * 0.12 }}
                >
                  <History className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {line}
                </motion.li>
              ))}
            </ul>
          </div>

          <div className={`${cardClass} min-h-[16rem] md:col-span-2`} {...on(4)}>
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <h3 className="text-xl font-semibold tracking-[-0.01em]">Reports you can hand on</h3>
                <p className="mt-1.5 max-w-md text-[0.9375rem] text-t2">
                  Verdicts by song and creator, a spreadsheet-safe CSV of every detection, and your complete data as JSON whenever you want it.
                </p>
              </div>
              <motion.span
                className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-bg text-tx"
                animate={!reduce && hovered === 4 ? { y: [0, 6, 0] } : { y: 0 }}
                transition={{ duration: 0.7 }}
              >
                <Download className="h-5 w-5" aria-hidden="true" />
              </motion.span>
            </div>
            <div className="mt-auto flex h-24 items-end gap-1.5 pt-6" aria-hidden="true">
              {[40, 70, 45, 90, 65, 85, 35, 60, 50, 80, 55, 75].map((h, i) => (
                <motion.div
                  key={i}
                  className="w-full rounded-t-sm bg-ultra/80"
                  initial={{ height: `${h}%` }}
                  animate={!reduce && hovered === 4 ? { height: [`${h}%`, `${Math.max(15, h - 30)}%`, `${h}%`] } : { height: `${h}%` }}
                  transition={{ duration: 1.6, delay: i * 0.04, ease: "easeInOut" }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
