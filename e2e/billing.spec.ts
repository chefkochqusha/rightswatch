import { test, expect } from "@playwright/test";
import { fillCompanyDetails } from "./helpers";

/**
 * Billing asks for the company details first (invoices, and the check that
 * the customer is a business), keeps what was typed when a check fails, and
 * needs a VAT ID from a business elsewhere in the EU.
 */
test("company details before the first plan", async ({ page }) => {
  await page.goto("/signup");
  await page.fill('input[name="workspaceName"]', "Billing Details Test");
  await page.fill('input[name="email"]', `e2e-billing-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "correct-horse-battery-1");
  await page.check('input[name="confirmBusiness"]');
  await page.click('main button[type="submit"]');
  await page.waitForURL(/\/workspace/);

  await page.goto("/workspace/billing");
  await expect(page.getByText("Add your company details above to start a trial.").first()).toBeVisible();
  await expect(page.locator('button[name="billingInterval"]')).toHaveCount(0);

  // A French business without a VAT ID: refused, and the typed values stay.
  await page.fill("#companyName", "Acme SARL");
  await page.fill("#addressLine1", "1 rue de Test");
  await page.fill("#postalCode", "75001");
  await page.fill("#city", "Paris");
  await page.selectOption("#country", "FR");
  await page.getByRole("button", { name: "Save company details" }).click();
  await expect(page.getByText("Business customers elsewhere in the EU need their VAT ID on the invoice.")).toBeVisible();
  await expect(page.locator("#companyName")).toHaveValue("Acme SARL");
  await expect(page.locator("#country")).toHaveValue("FR");

  await page.fill("#vatId", "FR 12 345678901");
  await page.getByRole("button", { name: "Save company details" }).click();
  await expect(page.getByText("FR12345678901")).toBeVisible();
  await expect(page.getByText(/Format checked/)).toBeVisible();

  // Now a plan can start, and the change is in the activity log.
  await page.locator('button[name="billingInterval"][value="MONTHLY"]').first().click();
  await expect(page.getByRole("button", { name: "Current plan" }).first()).toBeVisible();
  await page.goto("/workspace/audit");
  await expect(page.getByText("Updated the company details for invoices").first()).toBeVisible();

  // Changing them later works from the same page.
  await page.goto("/workspace/billing");
  await page.getByText("Change company details").click();
  // Moving to Germany: the French VAT ID no longer fits and is cleared.
  await fillCompanyDetails(page, { vatId: "" });
  await expect(page.getByText("FR12345678901")).toHaveCount(0);
});
