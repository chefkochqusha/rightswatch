"use client";

import { MotionConfig } from "motion/react";

/**
 * One place for the public site's animation rules. With "reduce motion" set in
 * the operating system, Motion skips movement (position, scale, rotation) and
 * keeps only short fades. The markup is the same either way, so the server
 * and the browser render identical HTML (no hydration mismatch).
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
