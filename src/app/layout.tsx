import type { Metadata } from "next";
import { connection } from "next/server";
import { siteOrigin } from "./_lib/site-origin";
// The display face of the landing page, also used for page titles in the app.
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: "Bekvor",
  description:
    "Know where your music appears commercially: paid TikTok posts, matched to your songs and checked against your licences.",
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
