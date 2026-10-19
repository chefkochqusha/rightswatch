"use server";

import { redirect } from "next/navigation";
import { confirmWaitlist, leaveWaitlist } from "@/modules/waitlist";
import { getWaitlistRepository } from "@/app/_lib/waitlist";

/**
 * Confirming and leaving take a button press, not just opening the link: mail
 * scanners open links on their own, and that must neither confirm an address
 * nor take it off the list.
 */
export async function confirmWaitlistAction(formData: FormData): Promise<void> {
  const result = await confirmWaitlist(String(formData.get("token") ?? ""), { repository: getWaitlistRepository() });
  redirect(`/waitlist/confirm?${result.ok ? "done=1" : "failed=1"}`);
}

export async function leaveWaitlistAction(formData: FormData): Promise<void> {
  await leaveWaitlist(String(formData.get("token") ?? ""), { repository: getWaitlistRepository() });
  // The same answer whether the link still matched an entry: nothing about the address is left either way.
  redirect("/waitlist/leave?done=1");
}
