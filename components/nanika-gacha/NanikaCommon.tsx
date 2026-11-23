"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebase";
import Link from "next/link";
import Image from "next/image";
import styles from "./nanika.module.css";

export function useNanikaAuth() {
  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => onAuthStateChanged(auth, account => { setUid(account?.uid ?? null); setReady(true); }), []);
  return { ready, uid };
}
export function nanikaError(error: unknown) {
  console.error("何かの景品ガチャの処理に失敗しました", error);
  return error instanceof Error ? error.message : "処理を確認できませんでした。再試行してください";
}
export function NanikaFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className={styles.page}>
    <h1>{title}</h1>
    <nav className={styles.nav} aria-label="何かの景品ガチャメニュー">
      <Link href="/nanika-gacha"><Image src="/menu/icons/gacha.webp" alt="" width={28} height={28} />ガチャ一覧</Link>
      <Link href="/nanika-gacha/prizes"><Image src="/menu/icons/gift.webp" alt="" width={28} height={28} />景品候補</Link>
      <Link href="/nanika-gacha/history"><Image src="/menu/icons/history.webp" alt="" width={28} height={28} />当選・受取</Link>
      <Link href="/nanika-gacha/guide"><Image src="/menu/icons/book.webp" alt="" width={28} height={28} />遊び方</Link>
    </nav>
    {children}
  </div>;
}
