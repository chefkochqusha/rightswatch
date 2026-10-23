import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The public information for creators (GDPR Art. 14): reachable from the footer, accessible in both themes.
for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`information for creators, ${colorScheme} mode`, () => {
    test.use({ colorScheme, reducedMotion: "reduce" });

    test("reachable from the footer and accessible", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "For creators" }).click();
      await expect(page).toHaveURL(/\/for-creators$/);
      await expect(page.getByRole("heading", { level: 1, name: "Information for creators" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "6. Your rights" })).toBeVisible();

      // Measure a fresh load, not the page mid-transition from the landing page,
      // and only once every finite fade-in has finished (as accessibility.spec does).
      await page.goto("/for-creators");
      await page.waitForLoadState("networkidle");
      await page.waitForFunction(() =>
        document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().endTime === Infinity),
      );
      await page.waitForTimeout(300); // motion's JS-driven tweens aren't in getAnimations()
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const found = result.violations.map(
        (v) => `${v.id}: ${v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")} ${n.failureSummary ?? ""}`).join(" | ")}`,
      );
      expect(found, found.join("\n")).toEqual([]);
    });
  });
}
