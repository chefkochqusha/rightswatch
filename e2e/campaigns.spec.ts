import { test, expect } from "@playwright/test";
import { addSong, newWorkspace } from "./helpers";

/**
 * Campaigns: create one, put a creator on it, limit a rights record to it
 * (then it can't be deleted), rename it, take the creator off, delete it.
 */
test("managing a campaign", async ({ page }) => {
  await newWorkspace(page, "Campaign Test");

  await page.goto("/workspace/campaigns");
  await page.fill("#campaign-name", "Summer launch");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Summer launch" })).toBeVisible();

  // The same name twice is refused.
  await page.fill("#campaign-name", "summer LAUNCH");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("There's already a campaign with that name.")).toBeVisible();

  await page.getByLabel("Creator to add to Summer launch").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add to Summer launch" }).click();
  await expect(page.getByRole("link", { name: /@lena\.creates/ })).toBeVisible();

  // The creator's page shows the campaign.
  await page.getByRole("link", { name: /@lena\.creates/ }).click();
  await page.waitForURL(/\/workspace\/creators\//);
  await expect(page.getByText("Summer launch", { exact: true })).toBeVisible();

  // A rights record limited to the campaign keeps it from being deleted.
  const songId = await addSong(page, `Campaign Song ${Date.now()}`);
  await page.goto(`/workspace/rights/${songId}`);
  await page.fill('input[name="startDate"]', "2026-01-01");
  await page.getByLabel("Only some campaigns").check();
  await page.getByLabel("Summer launch").check();
  await page.getByRole("button", { name: "Add rights record" }).click();
  // Saved: the record shows with an Edit button and its campaign.
  await expect(page.getByRole("button", { name: /Edit/ }).first()).toBeVisible();
  await expect(page.getByText("Summer launch", { exact: true })).toBeVisible();

  await page.goto("/workspace/campaigns");
  await expect(page.getByText("1 rights record limited to it")).toBeVisible();
  await page.getByRole("button", { name: "Delete Summer launch" }).click();
  await page.getByRole("button", { name: "Delete campaign" }).click();
  await expect(page.getByText(/A rights record is limited to this campaign/)).toBeVisible();

  // Rename, then take the creator off.
  await page.goto("/workspace/campaigns");
  await page.getByRole("button", { name: "Rename Summer launch" }).click();
  await page.getByLabel("New name for Summer launch").fill("Summer 2026");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Summer 2026" })).toBeVisible();
  await page.getByRole("button", { name: "Take off @lena.creates from Summer 2026" }).click();
  await expect(page.getByRole("link", { name: /@lena\.creates/ })).toHaveCount(0);

  // Once no record is limited to it, it can go.
  await page.goto(`/workspace/rights/${songId}`);
  await page.getByRole("button", { name: /Edit/ }).first().click();
  await page.getByLabel("Every campaign").check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  await page.goto("/workspace/campaigns");
  await expect(page.getByText("no rights record limited to it")).toBeVisible();
  await page.getByRole("button", { name: "Delete Summer 2026" }).click();
  await page.getByRole("button", { name: "Delete campaign" }).click();
  await expect(page.getByText("No campaigns yet.")).toBeVisible();

  await page.goto("/workspace/audit");
  await expect(page.getByText("Put @lena.creates on the campaign Summer launch")).toBeVisible();
  await expect(page.getByText("Deleted the campaign Summer 2026")).toBeVisible();
});
