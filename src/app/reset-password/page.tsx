import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { verifyPasswordResetToken } from "@/modules/auth/password-reset-token";
import { getSessionSecret } from "@/app/_lib/session-cookie";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = { title: "Set a new password — RightsWatch", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  // Signature and expiry only; whether the link was already used needs the
  // account, and is checked when the password is saved.
  const valid = value !== "" && verifyPasswordResetToken(value, getSessionSecret()) !== null;

  return (
    <AuthShell
      title="Set a new password"
      subtitle={valid ? "Choose a new password. You'll be logged out everywhere else." : "This link has expired or isn't valid."}
      footer={
        <Link href={valid ? "/login" : "/forgot-password"} className="font-medium text-accent hover:underline">
          {valid ? "Back to log in" : "Get a new link"}
        </Link>
      }
    >
      {valid ? <ResetPasswordForm token={value} /> : null}
    </AuthShell>
  );
}
