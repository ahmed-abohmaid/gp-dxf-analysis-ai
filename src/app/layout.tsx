import type { Metadata } from "next";

import "./globals.css";

import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "ELC — Electrical Load Calculator",
  description: "AI-powered electrical load calculations based on Saudi Building Code (SBC 401)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
