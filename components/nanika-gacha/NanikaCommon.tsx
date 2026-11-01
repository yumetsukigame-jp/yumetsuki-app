"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebase";
import Link from "next/link";
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
      <Link href="/nanika-gacha">ガチャ一覧</Link><Link href="/nanika-gacha/history">自分の当選・受取履歴</Link>
      <Link href="/nanika-gacha/guide">遊び方・注意事項</Link>
    </nav>
    {children}
  </div>;
}
