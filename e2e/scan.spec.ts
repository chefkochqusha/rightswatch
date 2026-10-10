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
  await page.selectOption("#creatorId", { label: "@lena.creates" });
  await page.fill('input[name="url"]', "https://www.tiktok.com/@someone.else/video/7301234567890000001");
  await page.getByRole("button", { name: "Add post" }).click();
  await expect(page.getByText("This link is a post by @someone.else, not @lena.creates.")).toBeVisible();
  await page.fill('input[name="url"]', "https://www.tiktok.com/@lena.creates/video/7301234567890000001");
  await page.getByRole("button", { name: "Add post" }).click();
  await page.waitForURL(/\/workspace\/items\/7301234567890000001/);
  await expect(page.getByText("Post added.")).toBeVisible();
});
