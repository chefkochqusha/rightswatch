/**
 * Waitlist mode (`WAITLIST_MODE=on`): sign-up is closed and the sign-up page
 * takes waitlist entries instead, until the business is registered and the
 * legal texts are final (`RELEASE_CHECKLIST.md`). Off by default. Pages are
 * rendered at build time where they can be, so a change takes a redeploy.
 */
export function isWaitlistMode(): boolean {
  return process.env.WAITLIST_MODE?.trim().toLowerCase() === "on";
}

/** The primary call to action on the website: signing up, or the waitlist. */
export function signupCtaLabel(): string {
  return isWaitlistMode() ? "Join the waitlist" : "Start monitoring";
}
