import { expect, test } from "@playwright/test";
import { newWorkspace } from "./helpers";

test("an Instagram creator, marked as promoting own paid offers, gets a post added by link", async ({ page }) => {
  await newWorkspace(page, "E2E Instagram");

  // Add an Instagram creator next to the TikTok one.
  await page.goto("/workspace/creators");
  await page.selectOption("#platform", "INSTAGRAM");
  await page.fill('input[name="username"]', "https://www.instagram.com/Mia.Moves/");
  await page.locator('form:has(input[name="username"]) button[type="submit"]').click();
  await expect(page.getByText(/@mia\.moves is on your watchlist\. Add their Instagram posts by link/)).toBeVisible();
  await expect(page.getByText("Posts by link", { exact: true })).toBeVisible();
  // Only the TikTok creator waits for a scan.
  await expect(page.getByRole("link", { name: "Pending 1" })).toBeVisible();

  // Mark them: the team's call, shown on the creator page.
  await page.getByRole("link", { name: /@mia\.moves/ }).first().click();
  await expect(page.getByText(/Scans don.t reach Instagram yet/)).toBeVisible();
  await page.getByRole("button", { name: "Mark as promoting own paid offers" }).click();
  await expect(page.getByText("Promotes own paid offers", { exact: true })).toBeVisible();

  // A TikTok link is refused for an Instagram creator; the reel link works.
  await page.goto("/workspace/posts/new");
  await page.selectOption("#creatorId", { label: "@mia.moves (Instagram)" });
  await page.fill('input[name="url"]', "https://www.tiktok.com/@mia.moves/video/7301234567890000009");
  await page.getByRole("button", { name: "Add post" }).click();
  await expect(page.getByText("This is a TikTok link, but @mia.moves is on your watchlist for Instagram.")).toBeVisible();
  await page.fill('input[name="url"]', "https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=e2e");
  await page.getByRole("button", { name: "Add post" }).click();
  await page.waitForURL(/\/workspace\/items\/C1a2B3c4D5e/);
  await expect(page.getByText("Post added.")).toBeVisible();
  await expect(page.getByText(/Your team marked @mia\.moves as promoting their own paid offers/)).toBeVisible();
  await expect(page.getByText(/No brand named · Own paid offer ·/)).toBeVisible();
});
