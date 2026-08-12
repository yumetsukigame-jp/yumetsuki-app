import type { Metadata } from "next";
import "./globals.css";
import UserFooter from "@/components/UserFooter";
import UserHeader from "@/components/UserHeader";
import LoginTracker from "@/components/LoginTracker";

export const metadata: Metadata = {
  title: "ゆめつきの書斎",
  description: "ゆめつきの小さな書斎サイト",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ja"
      className="h-full antialiased"
      style={{ colorScheme: "light" }}
    >
      <head>
        {/* ★ iPhone Safari の強制ダークモードを完全に無効化 */}
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </head>

      <body className="min-h-full flex flex-col">
        <LoginTracker />
        <UserHeader />
        <div className="flex-1">{children}</div>
        <UserFooter />
      </body>
    </html>
  );
}
