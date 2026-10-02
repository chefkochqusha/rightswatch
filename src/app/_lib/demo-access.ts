import { randomBytes } from "node:crypto";
import { hashPassword, UniqueConstraintError } from "@/modules/auth";
import { subscribeWorkspace, MockPaymentProvider } from "@/modules/billing";
import { getAuthStore } from "./auth-store";
import { DEMO_WORKSPACE_SLUG } from "./demo-constants";
import { getBillingStore } from "./billing-store";
import { loadDemoWorkspace } from "./demo-workspace";
import { getWorkspaceScanItems, runWorkspaceScan } from "./workspace-scan-store";

/**
 * The public demo (Brief §48, §76): one shared Northstar workspace filled
 * with the demo dataset, which anyone can open as a read-only viewer from
 * the landing page — the real app, not a separate mock-up of it.
 *
 * - The accounts are never loginable: their passwords are random values
 *   nobody is told, and their emails sit on a reserved `.invalid` domain.
 *   The only way in is `enterDemo`, which starts a session for the viewer.
 * - A viewer can read everything and change nothing (`authorize.ts`).
 * - The workspace pays with the mock provider even when Stripe is
 *   configured, so the demo can never touch a real billing account.
 * - It is created on the first visit and kept: the first visitor after a
 *   fresh database waits for the dataset to load; everyone after finds it
 *   ready.
 */
export { DEMO_WORKSPACE_SLUG };
const OWNER_EMAIL = "demo-owner@demo.rightswatch.invalid";
const VIEWER_EMAIL = "demo-viewer@demo.rightswatch.invalid";
const READY_TIMEOUT_MS = 90_000;

async function unusablePassword(): Promise<string> {
  return hashPassword(randomBytes(32).toString("hex"));
}

/** Creates the demo workspace and its two accounts, if they don't exist yet. */
async function createDemoWorkspace(): Promise<void> {
  const auth = getAuthStore();
  let owner;
  try {
    ({ user: owner } = await auth.accounts.createAccount({
      user: { email: OWNER_EMAIL, passwordHash: await unusablePassword(), name: "Nina Schneider" },
      role: "OWNER",
      workspace: { newName: "Northstar Music Publishing", newSlug: DEMO_WORKSPACE_SLUG },
    }));
  } catch (error) {
    if (error instanceof UniqueConstraintError) return; // another visitor is already creating it
    throw error;
  }
  const workspace = await auth.workspaces.findBySlug(DEMO_WORKSPACE_SLUG);
  if (!workspace) throw new Error("The demo workspace was just created but can't be found.");

  const billing = getBillingStore();
  await subscribeWorkspace(
    { workspaceId: workspace.id, planTier: "AGENCY", customerEmail: OWNER_EMAIL },
    { planRepository: billing.plans, subscriptionRepository: billing.subscriptions, paymentProvider: new MockPaymentProvider() },
  );

  // The viewer joins before the scan, so the scan's notifications reach it too.
  await auth.accounts.createAccount({
    user: { email: VIEWER_EMAIL, passwordHash: await unusablePassword(), name: "Demo visitor" },
    role: "VIEWER",
    workspace: { existingId: workspace.id },
  });

  await loadDemoWorkspace(workspace.id, owner.id);
  await runWorkspaceScan(workspace.id, owner.id);
}

/**
 * The viewer account's id once the demo is ready, creating the demo first
 * if needed. "Ready" means the scan has stored its results.
 */
export async function ensureDemo(): Promise<string> {
  const auth = getAuthStore();
  const deadline = Date.now() + READY_TIMEOUT_MS;

  for (;;) {
    const viewer = await auth.users.findByEmail(VIEWER_EMAIL);
    const workspace = await auth.workspaces.findBySlug(DEMO_WORKSPACE_SLUG);
    if (viewer && workspace && (await getWorkspaceScanItems(workspace.id)).length > 0) return viewer.id;
    if (!workspace) await createDemoWorkspace();
    else if (Date.now() > deadline) throw new Error("The demo is taking too long to get ready. Try again in a minute.");
    else await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}
