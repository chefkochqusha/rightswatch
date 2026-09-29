import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RightsWatch",
  description:
    "Detect unlicensed commercial use of your music catalogue on TikTok.",
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
