import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { LogInForm } from "./login-form";

export const metadata = {
  title: "Log in — RightsWatch",
};

/**
 * `?expired=1` comes from `requireSession()` when a cookie was sent but its
 * session is over — logged out on another device, expired, or the account
 * is gone — so the page says why the user landed here.
 */
export default async function LogInPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;

  return (
    <AuthShell
      title="Log in"
      subtitle={
        expired
          ? "Your session has ended. Log in again to continue."
          : "Welcome back to your RightsWatch workspace."
      }
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-accent hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <LogInForm />
    </AuthShell>
  );
}
