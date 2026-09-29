import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { SignUpForm } from "./signup-form";

export const metadata = {
  title: "Sign up — RightsWatch",
};

export default function SignUpPage() {
  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Start monitoring unlicensed commercial use of your catalogue on TikTok."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
