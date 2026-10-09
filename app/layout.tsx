import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trip Together｜同行行程",
  description: "讓同行團友一起看行程、邀請活動與投票決定下一站。",
  applicationName: "Trip Together",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Trip Together" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
