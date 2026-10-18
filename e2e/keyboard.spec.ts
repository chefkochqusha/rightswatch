import { expect, test, type Page } from "@playwright/test";

/**
 * Keyboard-only check: on each page, Tab walks every visible control once,
 * each shows a visible focus ring, focus never gets stuck, and pages with a
 * header start with "Skip to content". The login and signup pages have only
 * the logo before the form, so they need no skip link. A screen-reader pass
 * by a person is still on RELEASE_CHECKLIST.md.
 */
const PUBLIC = ["/", "/imprint", "/privacy", "/partner-terms"];
const AUTH = ["/login", "/signup"];
const WORKSPACE = ["/workspace", "/workspace/cases", "/workspace/creators", "/workspace/campaigns", "/workspace/rights", "/workspace/reports", "/workspace/settings", "/workspace/billing", "/workspace/team", "/workspace/audit", "/workspace/notifications", "/workspace/matches"];

async function keyboardIssues(page: Page, path: string, needsSkipLink: boolean): Promise<string[]> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const issues: string[] = [];
  const seen: string[] = [];
  for (let i = 0; i < 250; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate((n) => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      if (!el.dataset.kbd) el.dataset.kbd = String(n);
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        id: el.dataset.kbd,
        label: (el.getAttribute("aria-label") || el.textContent || (el as HTMLInputElement).name || el.tagName).trim().replace(/\s+/g, " ").slice(0, 50),
        ring: (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none",
        visible: r.width > 0 && r.height > 0,
      };
    }, i);
    if (!info) {
      if (seen.length > 0) break; // walked off the end of the page
      continue;
    }
    if (info.id === seen[0]) break; // wrapped around
    if (info.id === seen[seen.length - 1]) continue; // a date input's day, month and year
    if (seen.includes(info.id)) {
      issues.push(`${path}: focus is stuck, it comes back to "${info.label}"`);
      break;
    }
    if (seen.length === 0 && needsSkipLink && !/skip to content/i.test(info.label)) issues.push(`${path}: the first Tab doesn't reach "Skip to content"`);
    seen.push(info.id);
    if (!info.ring) issues.push(`${path}: no visible focus on "${info.label}"`);
    if (!info.visible) issues.push(`${path}: focus on something invisible ("${info.label}")`);
  }
  const unreached = await page.evaluate((reached) => {
    const selector = 'a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[inert]");
      })
      .filter((el) => !reached.includes(el.dataset.kbd ?? ""))
      .map((el) => (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40));
  }, seen);
  for (const label of unreached) issues.push(`${path}: "${label}" can't be reached with Tab`);
  return issues;
}

test.use({ reducedMotion: "reduce" });

test("public pages work with the keyboard alone", async ({ page }) => {
  const issues: string[] = [];
  for (const path of PUBLIC) issues.push(...(await keyboardIssues(page, path, true)));
  for (const path of AUTH) issues.push(...(await keyboardIssues(page, path, false)));
  expect(issues, issues.join("\n")).toEqual([]);
});

test("workspace pages (demo) work with the keyboard alone", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Try the demo/ }).first().click();
  await page.waitForURL(/\/workspace/);
  const issues: string[] = [];
  for (const path of WORKSPACE) issues.push(...(await keyboardIssues(page, path, true)));
  expect(issues, issues.join("\n")).toEqual([]);
});
