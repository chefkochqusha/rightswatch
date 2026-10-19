import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { normalizePartnerCode } from "@/modules/referrals";
import { SignUpForm } from "./signup-form";
import { WaitlistForm } from "./waitlist-form";
import { isWaitlistMode } from "@/app/_lib/waitlist-mode";
import { WAITLIST_CONSENT } from "@/modules/waitlist";

export async function generateMetadata() {
  return { title: isWaitlistMode() ? "Join the waitlist — Bekvor" : "Sign up — Bekvor" };
}

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  // A partner link (`?ref=<code>`) is carried in the form itself: no cookie, nothing stored on the device.
  const partnerCode = normalizePartnerCode((await searchParams).ref);
  if (isWaitlistMode()) {
    return (
      <AuthShell
        title="Join the waitlist"
        subtitle="Bekvor opens to businesses step by step. Leave your work email and we'll tell you when your access is ready."
        footer={
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-accent hover:underline">
              Log in
            </Link>
          </>
        }
      >
        <WaitlistForm consentText={WAITLIST_CONSENT.text} />
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Find where your songs are used in paid TikTok posts, and check each use against your licences."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <SignUpForm partnerCode={partnerCode} />
    </AuthShell>
  );
}
