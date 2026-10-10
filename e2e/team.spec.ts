import { test, expect, type Browser, type Page } from "@playwright/test";
import { fillCompanyDetails } from "./helpers";

/**
 * Managing the team: invite two people, change a role, remove someone (their
 * login stops working), and hand the workspace to an admin.
 */
async function invite(page: Page, email: string, role: "ADMIN" | "ANALYST" | "VIEWER"): Promise<string> {
  await page.goto("/workspace/team");
  await page.fill('input[name="email"]', email);
  await page.selectOption("#role", role);
  await page.getByRole("button", { name: /Send invite/ }).click();
  const link = page.locator("input[readonly]");
  await expect(link).toBeVisible();
  return link.inputValue();
}

async function accept(browser: Browser, link: string, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(link);
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="password"]', "correct-horse-battery-2");
  await page.locator('main button[type="submit"]').click();
  await page.waitForURL(/\/workspace/);
  return page;
}

test("roles, removal and handing over the workspace", async ({ page, browser }) => {
  const stamp = Date.now();
  await page.goto("/signup");
  await page.fill('input[name="workspaceName"]', "Team Test");
  await page.fill('input[name="email"]', `e2e-owner-${stamp}@example.com`);
  await page.fill('input[name="password"]', "correct-horse-battery-1");
  await page.check('input[name="confirmBusiness"]');
  await page.click('main button[type="submit"]');
  await page.waitForURL(/\/workspace/);
  // Starter: three seats.
  await page.goto("/workspace/billing");
  await fillCompanyDetails(page);
  await page.locator('form:has(input[name="planTier"][value="STARTER"]) button[name="billingInterval"][value="MONTHLY"]').click();
  await expect(page.getByRole("button", { name: "Current plan" }).first()).toBeVisible();

  const adaPage = await accept(browser, await invite(page, `e2e-ada-${stamp}@example.com`, "ADMIN"), "Ada Admin");
  const benPage = await accept(browser, await invite(page, `e2e-ben-${stamp}@example.com`, "ANALYST"), "Ben Analyst");

  // Ben becomes a viewer.
  await page.goto("/workspace/team");
  await page.getByLabel("Role of Ben Analyst").selectOption("VIEWER");
  await page.locator("form", { has: page.getByLabel("Role of Ben Analyst") }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Role changed to Viewer.")).toBeVisible();

  // Ben is removed, and his session stops working.
  await page.getByRole("button", { name: "Remove Ben Analyst" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("Ben Analyst")).toHaveCount(0);
  await benPage.goto("/workspace");
  await expect(benPage).toHaveURL(/\/login/);

  // The owner hands over to Ada and stays as an admin.
  await page.selectOption("#transfer-to", { label: `Ada Admin (e2e-ada-${stamp}@example.com)` });
  await page.fill("#transfer-password", "correct-horse-battery-1");
  await page.getByRole("button", { name: "Make owner" }).click();
  // The page re-renders for an admin: the hand-over section is gone.
  await expect(page.getByText("Hand over the workspace")).toHaveCount(0);
  await adaPage.goto("/workspace/team");
  await expect(adaPage.getByText("Hand over the workspace")).toBeVisible();

  await adaPage.goto("/workspace/audit");
  await expect(adaPage.getByText("Handed the workspace to a new owner").first()).toBeVisible();
  await expect(adaPage.getByText("Removed a member").first()).toBeVisible();
});
