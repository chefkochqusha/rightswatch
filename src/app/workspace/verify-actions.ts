"use server";

import { requireSession } from "@/app/_lib/current-user";
import { DEMO_WORKSPACE_SLUG } from "@/app/_lib/demo-access";
import { sendVerificationLink } from "@/app/_lib/email-verification";

export interface ResendState {
  message?: string;
}

/** "Send the link again", from the banner. */
export async function resendVerificationAction(): Promise<ResendState> {
  const session = await requireSession();
  if (session.workspace.slug === DEMO_WORKSPACE_SLUG || session.user.emailVerified) return {};
  const outcome = await sendVerificationLink(session.user.id).catch(() => "UNAVAILABLE" as const);
  switch (outcome) {
    case "SENT":
      return { message: `Sent to ${session.user.email}. Check your inbox.` };
    case "RATE_LIMITED":
      return { message: "Already sent a few times. Check your inbox and spam folder, then try again later." };
    case "UNAVAILABLE":
      return { message: "Email can't be sent from here right now." };
    default:
      return {};
  }
}
