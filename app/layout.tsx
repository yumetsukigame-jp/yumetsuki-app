import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import UserFooter from "@/components/UserFooter";
import UserHeader from "@/components/UserHeader";
import LoginTracker from "@/components/LoginTracker"; // ★ 追加

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">

        {/* ★ ログイン更新処理（クライアント側） */}
        <LoginTracker />

        {/* 共通ヘッダー */}
        <UserHeader />

        {/* ページ内容 */}
        <div className="flex-1">{children}</div>

        {/* 共通フッター */}
        <UserFooter />
      </body>
    </html>
  );
}
