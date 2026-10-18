"use server";

import { headers } from "next/headers";
import { OutboxEmailSender, WAITLIST_CONFIRM_TEMPLATE, waitlistConfirmEmail } from "@/modules/email";
import { joinWaitlist, type JoinError } from "@/modules/waitlist";
import { getAppBaseUrl, getEmailSender } from "@/app/_lib/email";
import { clientIpFrom, spendRequest } from "@/app/_lib/request-limit";
import { getWaitlistRepository, isWaitlistMode } from "@/app/_lib/waitlist";

export interface WaitlistFormState {
  fieldErrors?: Partial<Record<"email" | "company" | "consent" | "business", string>>;
  formError?: string;
  done?: boolean;
  /** What was sent, so the form keeps it after an error (React resets a form after its action). */
  values?: { email: string; company: string; business: boolean; consent: boolean };
  attempt?: number;
  /** Development only, with no email provider: the confirmation link. */
  devLink?: string;
}

const MESSAGES: Record<JoinError, { field: "email" | "company" | "consent" | "business"; message: string }> = {
  INVALID_EMAIL: { field: "email", message: "Enter a valid email address." },
  COMPANY_TOO_LONG: { field: "company", message: "Keep the company name under 120 characters." },
  CONSENT_REQUIRED: { field: "consent", message: "Tick the box so we may email you when your access is ready." },
  BUSINESS_REQUIRED: { field: "business", message: "Please confirm this is for business use and that you are at least 18." },
};

/**
 * Joins the waitlist (double opt-in). The answer is the same whether the
 * address was new, waiting or already confirmed.
 */
export async function joinWaitlistAction(prev: WaitlistFormState, formData: FormData): Promise<WaitlistFormState> {
  const result = await join(formData);
  return {
    ...result,
    attempt: (prev.attempt ?? 0) + 1,
    values: {
      email: String(formData.get("email") ?? ""),
      company: String(formData.get("company") ?? ""),
      business: formData.get("business") === "on",
      consent: formData.get("consent") === "on",
    },
  };
}

async function join(formData: FormData): Promise<WaitlistFormState> {
  if (!isWaitlistMode()) return { formError: "The waitlist is closed. Sign up instead." };
  const sender = getEmailSender();
  const baseUrl = await getAppBaseUrl();
  if (!baseUrl || (sender.mode === "OUTBOX" && process.env.NODE_ENV === "production")) {
    return { formError: "We can't send emails right now, so the waitlist can't take addresses. Please try again later." };
  }

  const email = String(formData.get("email") ?? "");
  const ip = clientIpFrom(await headers());
  if ((await spendRequest("waitlist-ip", ip, { max: 10, windowMs: 3600_000, shared: true })) !== null) {
    return { formError: "Too many requests from this network. Please try again in an hour." };
  }
  // At most three confirmation emails per address and hour, whoever asks.
  if ((await spendRequest("waitlist-email", email.trim().toLowerCase(), { max: 3, windowMs: 3600_000, shared: true })) !== null) {
    return { done: true };
  }

  const result = await joinWaitlist(
    {
      email,
      company: String(formData.get("company") ?? ""),
      consent: formData.get("consent") === "on",
      business: formData.get("business") === "on",
    },
    {
      repository: getWaitlistRepository(),
      linkFor: (kind, token) => `${baseUrl}/waitlist/${kind}?token=${encodeURIComponent(token)}`,
      sendConfirmation: async (to, links) => {
        await sender.send(waitlistConfirmEmail({ to, confirmLink: links.confirm, leaveLink: links.leave, imprintLink: `${baseUrl}/imprint` }));
        return { template: WAITLIST_CONFIRM_TEMPLATE };
      },
    },
  );
  if (!result.ok) {
    const { field, message } = MESSAGES[result.error];
    return { fieldErrors: { [field]: message } };
  }
  if (sender instanceof OutboxEmailSender) {
    const link = sender.messages().find((m) => m.to === email.trim().toLowerCase())?.text.match(/https?:\/\/\S*\/waitlist\/confirm\S*/)?.[0];
    return { done: true, devLink: link };
  }
  return { done: true };
}
