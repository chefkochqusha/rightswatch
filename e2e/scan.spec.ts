import { expect, test } from "@playwright/test";
import { newWorkspace } from "./helpers";

test("a scan runs and its results appear on the overview", async ({ page }) => {
  await newWorkspace(page, "E2E Scan");
  await page.goto("/workspace");
  await page.getByRole("button", { name: "Run scan" }).click();
  // Worker mode queues the scan and the page refreshes itself; inline mode answers at once.
  await expect(page.getByText(/Scan started|Scan complete/)).toBeVisible();
  await expect(page.getByText("Videos checked", { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/A scan is (running|waiting)/)).toHaveCount(0, { timeout: 90_000 });
});

test("a post added by hand opens its page, ready to identify", async ({ page }) => {
  await newWorkspace(page, "E2E Post");
  await page.goto("/workspace/posts/new");
  await page.selectOption("#creatorId", { label: "@lena.creates (TikTok)" });
  await page.fill('input[name="url"]', "https://www.tiktok.com/@someone.else/video/7301234567890000001");
  await page.getByRole("button", { name: "Add post" }).click();
  await expect(page.getByText("This link is a post by @someone.else, not @lena.creates.")).toBeVisible();
  await page.fill('input[name="url"]', "https://www.tiktok.com/@lena.creates/video/7301234567890000001");
  await page.getByRole("button", { name: "Add post" }).click();
  await page.waitForURL(/\/workspace\/items\/7301234567890000001/);
  await expect(page.getByText("Post added.")).toBeVisible();
});

test("an Instagram creator and a reel added by hand", async ({ page }) => {
  await newWorkspace(page, "E2E Instagram");
  await page.goto("/workspace/creators");
  await page.selectOption("#platform", "INSTAGRAM");
  await page.fill('input[name="username"]', "https://www.instagram.com/lena.creates/");
  await page.locator('form:has(input[name="username"]) button[type="submit"]').click();
  await expect(page.getByText("@lena.creates on Instagram is on your watchlist.")).toBeVisible();

  await page.goto("/workspace/posts/new");
  // A reel can't go on the TikTok creator of the same name.
  await page.selectOption("#creatorId", { label: "@lena.creates (TikTok)" });
  await page.fill('input[name="url"]', "https://www.instagram.com/reel/C1a2B3c4D5e/");
  await page.getByRole("button", { name: "Add post" }).click();
  await expect(page.getByText(/This is an Instagram link/)).toBeVisible();
  await page.selectOption("#creatorId", { label: "@lena.creates (Instagram)" });
  await page.fill('input[name="url"]', "https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=abc");
  await page.getByRole("button", { name: "Add post" }).click();
  await page.waitForURL(/\/workspace\/items\/C1a2B3c4D5e/);
  await expect(page.getByText("Post added.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open on Instagram/ })).toBeVisible();
});
