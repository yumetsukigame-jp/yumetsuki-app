"use client";

import { useEffect } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import UserFooter from "@/components/UserFooter";
import UserHeader from "@/components/UserHeader";

import { auth, db } from "@/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, updateDoc, increment } from "firebase/firestore";

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

  /* --------------------------------------------------
     ★ ログイン時に lastLogin / loginCount を更新
  -------------------------------------------------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        await updateDoc(doc(db, "users", u.uid), {
          lastLogin: new Date(),
          loginCount: increment(1),
        });
      }
    });

    return () => unsub();
  }, []);

  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <UserHeader />

        <div className="flex-1">
          {children}
        </div>

        <UserFooter />
      </body>
    </html>
  );
}
