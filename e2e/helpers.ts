import { expect, type Page } from "@playwright/test";
import path from "node:path";

export const AUDIO_DIR = path.join(__dirname, ".audio");

/** A fresh workspace with a plan and one creator on the watchlist. */
export async function newWorkspace(page: Page, name: string): Promise<void> {
  await page.goto("/signup");
  await page.fill('input[name="workspaceName"]', name);
  await page.fill('input[name="email"]', `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`);
  await page.fill('input[name="password"]', "correct-horse-battery-1");
  await page.check('input[name="confirmBusiness"]');
  await page.click('main button[type="submit"]');
  await page.waitForURL(/\/workspace/);
  await page.goto("/workspace/billing");
  await fillCompanyDetails(page);
  await page.locator('button[name="billingInterval"][value="MONTHLY"]').first().click();
  await expect(page.getByRole("button", { name: "Current plan" }).first()).toBeVisible();
  await page.goto("/workspace/creators");
  await page.fill('input[name="username"]', "lena.creates");
  await page.locator('form:has(input[name="username"]) button[type="submit"]').click();
  await expect(page.getByText("@lena.creates").first()).toBeVisible();
}

/** Adds a catalogue song by hand; returns its id. */
export async function addSong(page: Page, title: string): Promise<string> {
  await page.goto("/workspace/rights");
  await page.getByRole("button", { name: "Add a song by hand" }).click();
  await page.fill("#manual-title", title);
  await page.fill("#manual-artist", "Test Artist");
  await page.getByRole("button", { name: "Add song" }).click();
  const link = page.locator(`a:has-text("${title}")`).first();
  await expect(link).toBeVisible();
  return (await link.getAttribute("href"))!.split("/").pop()!;
}

/** Adds a post by hand; returns to its page. */
export async function addPost(page: Page, videoId: string): Promise<void> {
  await page.goto("/workspace/posts/new");
  await page.selectOption("#creatorId", { label: "@lena.creates" });
  await page.fill('input[name="url"]', `https://www.tiktok.com/@lena.creates/video/${videoId}`);
  await page.fill('input[name="brands"]', "Glow Cosmetics");
  await page.getByRole("button", { name: "Add post" }).click();
  await page.waitForURL(new RegExp(`/workspace/items/${videoId}`));
}

/** The company details the billing page asks for before the first plan. */
export async function fillCompanyDetails(page: Page, overrides: { country?: string; vatId?: string } = {}): Promise<void> {
  await page.fill("#companyName", "E2E Test Records GmbH");
  await page.fill("#addressLine1", "Teststraße 1");
  await page.fill("#postalCode", "10115");
  await page.fill("#city", "Berlin");
  await page.selectOption("#country", overrides.country ?? "DE");
  if (overrides.vatId !== undefined) await page.fill("#vatId", overrides.vatId);
  await page.getByRole("button", { name: "Save company details" }).click();
  await expect(page.getByText("E2E Test Records GmbH").first()).toBeVisible();
}
