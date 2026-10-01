import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { verifyEmail } from "@/modules/auth";
import { getAuthStore } from "@/app/_lib/auth-store";
import { getSessionSecret } from "@/app/_lib/session-cookie";

export const metadata = { title: "Confirm your email — RightsWatch", robots: { index: false } };

/**
 * The page an emailed confirmation link opens. Opening it confirms the
 * address (the link is signed and names the address); opening it again is
 * harmless. Nothing in the app is locked behind this.
 */
export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  const result = value ? await verifyEmail(value, { userRepository: getAuthStore().users, secret: getSessionSecret() }) : { ok: false as const };

  return (
    <AuthShell
      title={result.ok ? "Email confirmed" : "This link doesn't work"}
      subtitle={
        result.ok
          ? "Thanks. Your email address is confirmed."
          : "It may have expired or been altered. Log in and ask for a new one from the banner at the top of the app."
      }
      footer={
        <Link href="/workspace" className="font-medium text-accent hover:underline">
          Go to RightsWatch
        </Link>
      }
    >
      {null}
    </AuthShell>
  );
}
