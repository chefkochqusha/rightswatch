"use client";

import { motion, type Variants } from "motion/react";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", damping: 26, stiffness: 120 } },
};

/**
 * Scroll reveal adapted from Watermelon UI's staggered entrances: children
 * marked with <RevealItem> rise and sharpen in as the block scrolls into view,
 * once. With "reduce motion" on, MotionProvider leaves only a short fade.
 */
export function Reveal({ children, className, as = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "section" | "ul" | "ol" }) {
  const Tag = motion[as];
  return (
    <Tag className={className} variants={container} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>
      {children}
    </Tag>
  );
}

export function RevealItem({ children, className, as = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "li" | "p" | "h2" }) {
  const Tag = motion[as];
  return (
    <Tag className={className} variants={item}>
      {children}
    </Tag>
  );
}
