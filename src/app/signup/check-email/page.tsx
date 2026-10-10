import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";

export const metadata = { title: "Check your inbox — Bekvor", robots: { index: false } };

/**
 * Where every signup ends when this server sends email, whether the address
 * was new or already had an account — so the page never tells anyone which.
 */
export default function CheckEmailPage() {
  return (
    <AuthShell
      title="Check your inbox"
      subtitle="We sent an email to the address you entered. Open the link in it to confirm your address, then log in. It can take a minute; look in the spam folder too."
      footer={
        <>
          Already confirmed?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Log in
          </Link>
        </>
      }
    >
      {null}
    </AuthShell>
  );
}
