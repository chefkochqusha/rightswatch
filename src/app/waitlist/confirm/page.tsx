import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { confirmWaitlistAction } from "../actions";

export const metadata = { title: "Confirm your place — Bekvor", robots: { index: false } };

const BUTTON =
  "h-11 w-full rounded-full bg-accent px-4 text-[0.9375rem] font-medium text-accent-fg transition-[transform,background-color] duration-100 ease-out hover:bg-accent-strong active:scale-[0.98]";

export default async function ConfirmWaitlistPage({ searchParams }: { searchParams: Promise<{ token?: string; done?: string; failed?: string }> }) {
  const { token, done, failed } = await searchParams;
  const footer = (
    <Link href="/" className="font-medium text-accent hover:underline">
      Back to Bekvor
    </Link>
  );

  if (done) {
    return (
      <AuthShell title="You're on the waitlist" subtitle="Thanks for confirming. We'll email you when your access is ready." footer={footer}>
        <p className="text-sm text-t2">Every email from us has a link to leave the waitlist, and you can ask us to delete your address at any time.</p>
      </AuthShell>
    );
  }
  if (failed || !token) {
    return (
      <AuthShell title="This link doesn't work" subtitle="It may have expired (links work for 7 days) or been replaced by a newer one." footer={footer}>
        <Link href="/signup" className="text-sm font-medium text-accent hover:underline">
          Join the waitlist again
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Confirm your place" subtitle="Confirm that we may email you when your access to Bekvor is ready." footer={footer}>
      <form action={confirmWaitlistAction}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" className={BUTTON}>
          Confirm my place
        </button>
      </form>
    </AuthShell>
  );
}
