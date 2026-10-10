import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { normalizePartnerCode } from "@/modules/referrals";
import { SignUpForm } from "./signup-form";

export const metadata = {
  title: "Sign up — Bekvor",
};

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  // A partner link (`?ref=<code>`) is carried in the form itself: no cookie, nothing stored on the device.
  const partnerCode = normalizePartnerCode((await searchParams).ref);
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
