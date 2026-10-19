import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Automated accessibility check (axe-core, WCAG 2.1 A/AA rules) on every public
 * page and every workspace page (lists and one detail page of each kind), in
 * light and dark mode. It catches what a machine can: contrast, names, labels,
 * landmarks, list and table structure. It doesn't replace a person trying the
 * app with a keyboard and a screen reader (BFSG, see LEGAL_DE.md).
 */
const PUBLIC = [
  "/",
  "/login",
  "/signup",
  "/signup/check-email",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/invite/accept",
  "/imprint",
  "/privacy",
  "/partner-terms",
  "/this-page-does-not-exist",
];
const WORKSPACE = [
  "/workspace",
  "/workspace/cases",
  "/workspace/matches",
  "/workspace/creators",
  "/workspace/campaigns",
  "/workspace/rights",
  "/workspace/posts/new",
  "/workspace/reports",
  "/workspace/notifications",
  "/workspace/team",
  "/workspace/audit",
  "/workspace/settings",
  "/workspace/billing",
];
/** Detail pages: the first link of each kind found on these list pages. */
const DETAIL_FROM: [list: string, link: RegExp][] = [
  ["/workspace/creators", /^\/workspace\/creators\/[^/?#]+$/],
  ["/workspace/rights", /^\/workspace\/rights\/[^/?#]+$/],
  ["/workspace/cases", /^\/workspace\/items\/[^/?#]+$/],
];

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
      const details: string[] = [];
      for (const [list, pattern] of DETAIL_FROM) {
        await page.goto(list);
        const hrefs = await page.locator("main a[href]").evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
        const first = hrefs.find((h) => pattern.test(h));
        expect(first, `no detail link on ${list}`).toBeTruthy();
        details.push(first!);
      }
      for (const path of [...WORKSPACE, ...details]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        found.push(...(await violations(page)).map((v) => `${path}: ${v}`));
      }
      expect(found, found.join("\n")).toEqual([]);
    });
  });
}
