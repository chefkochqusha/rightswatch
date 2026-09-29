import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { LogInForm } from "./login-form";

export const metadata = {
  title: "Log in — RightsWatch",
};

export default function LogInPage() {
  return (
    <AuthShell
      title="Log in"
      subtitle="Welcome back to your RightsWatch workspace."
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
