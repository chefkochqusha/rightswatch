"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { InMemoryRateLimiter } from "@/modules/auth";
import { ensureDemo } from "@/app/_lib/demo-access";
import { setSessionCookie, clearSessionCookie } from "@/app/_lib/session-cookie";

// Opening the demo starts a session; 20 per hour per address is plenty for a
// person and slows a script. In memory, per instance, like the login limits.
const globalForDemo = globalThis as unknown as { __rightswatchDemoLimiter?: InMemoryRateLimiter };
function limiter() {
  return (globalForDemo.__rightswatchDemoLimiter ??= new InMemoryRateLimiter({ maxAttempts: 20, windowMs: 60 * 60 * 1000, blockMs: 15 * 60 * 1000 }));
}

/** "Try the demo": a read-only session in the shared Northstar workspace. */
export async function enterDemoAction(): Promise<void> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limiter().isBlocked(ip).blocked) redirect("/?demo=busy");
  limiter().recordFailure(ip);

  const viewerId = await ensureDemo();
  await setSessionCookie(viewerId);
  redirect("/workspace");
}

/** Leaves the demo for the sign-up page. */
export async function leaveDemoAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/signup");
}
