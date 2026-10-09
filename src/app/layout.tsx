import type { Metadata } from "next";
import { connection } from "next/server";
import { siteOrigin } from "./_lib/site-origin";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: "Bekvor",
  description:
    "Detect unlicensed commercial use of your music catalogue on TikTok.",
  openGraph: { siteName: "Bekvor", type: "website" },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Every page renders per request: the Content-Security-Policy in `proxy.ts` carries a fresh
  // script nonce each time, and Next.js can only apply a nonce while it renders a request.
  await connection();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-bg text-tx">
        {children}
      </body>
    </html>
  );
}
