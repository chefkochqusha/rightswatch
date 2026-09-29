"use server";

import { redirect } from "next/navigation";
import { clearSessionCookie } from "@/app/_lib/session-cookie";

export async function logOutAction() {
  await clearSessionCookie();
  redirect("/");
}
