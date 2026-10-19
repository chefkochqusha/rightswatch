import { expect, test } from "@playwright/test";

// The waitlist form only shows with WAITLIST_MODE=on (unit tests cover joining,
// confirming and leaving). These pages answer links from emails at any time.
test("waitlist links: an unknown link is refused, and leaving needs a button press", async ({ page }) => {
  await page.goto("/waitlist/confirm?token=not-a-real-token");
  await page.getByRole("button", { name: "Confirm my place" }).click();
  await expect(page.getByRole("heading", { name: "This link doesn't work" })).toBeVisible();

  await page.goto("/waitlist/leave?token=not-a-real-token");
  await expect(page.getByRole("heading", { name: "Leave the waitlist" })).toBeVisible();
  await page.getByRole("button", { name: "Delete my address" }).click();
  await expect(page.getByRole("heading", { name: "You're off the waitlist" })).toBeVisible();

  // With the waitlist off, sign-up works as before.
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();
});
