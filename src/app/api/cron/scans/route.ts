import { timingSafeEqual } from "node:crypto";
import { runDueScans } from "@/app/_lib/scheduled-scans";

// A scan of many creators takes a while; the budget inside `runDueScans`
// stops starting new workspaces well before this.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * The scheduled-scan endpoint, called by Vercel Cron (`vercel.json`).
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` when the project has
 * that variable. With no secret configured the endpoint refuses everything,
 * so it can't be triggered by anyone who finds the URL.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET isn't set." }, { status: 503 });

  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  return Response.json(await runDueScans());
}
