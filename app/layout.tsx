import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import UserFooter from "@/components/UserFooter";
import UserHeader from "@/components/UserHeader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/* --------------------------------------------------
   ★ iOS / Android ホーム画面アイコン対応
   Next.js の metadata に書くだけで OK
-------------------------------------------------- */
export const metadata: Metadata = {
  title: "ゆめつきの書斎",
  description: "ゆめつきの小さな書斎サイト",

  // ▼ Android（Chrome）用
  manifest: "/manifest.json",

  // ▼ iOS（Safari）用
  icons: {
    icon: "/icon-192.png",              // Android 通常アイコン
    apple: "/apple-touch-icon.png",     // iOS ホーム画面アイコン
  },

  // ▼ PWA 共通
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* 共通ヘッダー */}
        <UserHeader />

        {/* ページ内容 */}
        <div className="flex-1">
          {children}
        </div>

        {/* 共通フッター */}
        <UserFooter />
      </body>
    </html>
  );
}
