import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The public information for creators (GDPR Art. 14): reachable from the footer, accessible in both themes.
for (const colorScheme of ["light", "dark"] as const) {
  test(`information for creators, ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "For creators" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Information for creators" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "6. Your rights" })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
