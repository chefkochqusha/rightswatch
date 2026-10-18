import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { leaveWaitlistAction } from "../actions";

export const metadata = { title: "Leave the waitlist — Bekvor", robots: { index: false } };

const BUTTON =
  "h-11 w-full rounded-full border border-line bg-surface-2 px-4 text-[0.9375rem] font-medium text-tx transition-[transform,background-color] duration-100 ease-out hover:bg-hover active:scale-[0.98]";

export default async function LeaveWaitlistPage({ searchParams }: { searchParams: Promise<{ token?: string; done?: string }> }) {
  const { token, done } = await searchParams;
  const footer = (
    <Link href="/" className="font-medium text-accent hover:underline">
      Back to Bekvor
    </Link>
  );
  if (done || !token) {
    return (
      <AuthShell title="You're off the waitlist" subtitle="Your address is deleted. You won't get any more emails about the waitlist." footer={footer}>
        <p className="text-sm text-t2">Changed your mind? You can join again on the sign-up page.</p>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Leave the waitlist" subtitle="We'll delete your address and won't email you about Bekvor again." footer={footer}>
      <form action={leaveWaitlistAction}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" className={BUTTON}>
          Delete my address
        </button>
      </form>
    </AuthShell>
  );
}
