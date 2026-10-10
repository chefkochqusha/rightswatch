import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Automated accessibility check (axe-core, WCAG 2.1 A/AA rules) on the public
 * pages and the main workspace pages, in light and dark mode. It catches what
 * a machine can: contrast, names, labels, landmarks. It doesn't replace a
 * person trying the app with a keyboard and a screen reader (BFSG, see
 * LEGAL_DE.md).
 */
const PUBLIC = ["/", "/login", "/signup", "/imprint", "/privacy"];
const WORKSPACE = ["/workspace", "/workspace/cases", "/workspace/creators", "/workspace/rights", "/workspace/settings", "/workspace/billing"];

async function violations(page: Page): Promise<string[]> {
  // Fade-ins measured halfway would fail contrast for the wrong reason: wait
  // until every finite animation has finished (the marquees loop forever).
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().endTime === Infinity),
  );
  await page.waitForTimeout(300); // motion's JS-driven tweens aren't in getAnimations()
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return result.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n    ")}`,
  );
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`accessibility, ${colorScheme} mode`, () => {
    test.use({ colorScheme, reducedMotion: "reduce" });

    test("public pages", async ({ page }) => {
      const found: string[] = [];
      for (const path of PUBLIC) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        found.push(...(await violations(page)).map((v) => `${path}: ${v}`));
      }
      expect(found, found.join("\n")).toEqual([]);
    });

    test("workspace pages (demo)", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: /Try the demo/ }).first().click();
      await page.waitForURL(/\/workspace/);
      const found: string[] = [];
      for (const path of WORKSPACE) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        found.push(...(await violations(page)).map((v) => `${path}: ${v}`));
      }
      expect(found, found.join("\n")).toEqual([]);
    });
  });
}
