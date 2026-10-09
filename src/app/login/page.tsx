import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { LogInForm } from "./login-form";

export const metadata = {
  title: "Log in — Bekvor",
};

/**
 * `?expired=1` comes from `requireSession()` when a cookie was sent but its
 * session is over — logged out on another device, expired, or the account
 * is gone — so the page says why the user landed here.
 */
export default async function LogInPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string; reset?: string; deleted?: string; accountDeleted?: string }>;
}) {
  const { expired, reset, deleted, accountDeleted } = await searchParams;

  return (
    <AuthShell
      title="Log in"
      subtitle={
        deleted
          ? "Your workspace and everything in it was deleted."
          : accountDeleted
          ? "Your account was deleted."
          : reset
          ? "Your password is updated. Log in with the new one."
          : expired
            ? "Your session has ended. Log in again to continue."
            : "Welcome back to your Bekvor workspace."
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
