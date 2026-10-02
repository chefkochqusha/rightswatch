import type { Metadata } from "next";
import { siteOrigin } from "./_lib/site-origin";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: "RightsWatch",
  description:
    "Detect unlicensed commercial use of your music catalogue on TikTok.",
  openGraph: { siteName: "RightsWatch", type: "website" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-bg text-tx">
        {children}
      </body>
    </html>
  );
}
