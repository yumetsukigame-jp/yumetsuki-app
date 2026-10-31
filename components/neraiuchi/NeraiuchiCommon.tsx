"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import { auth } from "@/firebase";
import type { NeraiuchiEntry, NeraiuchiEvent } from "@/app/lib/neraiuchi";
import { formatJstDateTime } from "@/app/lib/dateTime";
import styles from "./neraiuchi.module.css";
import NeraiuchiPrizeClaim from "./NeraiuchiPrizeClaim";

export function useNeraiuchiAuth() {
  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => onAuthStateChanged(auth, (user) => {
    setUid(user?.uid ?? null);
    setReady(true);
  }), []);
  return { ready, uid };
}

export function NeraiuchiFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className={styles.page}>
    <h1>{title}</h1>
    <nav className={styles.nav} aria-label="狙い撃ちメニュー">
      <Link href="/neraiuchi">企画一覧</Link>
      <Link href="/neraiuchi/history">自分の参加履歴</Link>
      <Link href="/neraiuchi/guide">遊び方</Link>
    </nav>
    {children}
  </div>;
}

export function LoginNotice() {
  return <p>ログインしてご利用ください。<Link href="/login">ログインはこちら</Link></p>;
}

export function ErrorNotice({ error, retry }: { error: string; retry?: () => void }) {
  return <div role="alert" className={styles.error}><p>{error}</p>
    {retry && <button type="button" onClick={retry}>再取得</button>}
  </div>;
}

export function errorMessage(error: unknown) {
  console.error("狙い撃ちの処理に失敗しました", error);
  return error instanceof Error ? error.message : "状態を取得できませんでした。再試行してください。";
}

export function EventInfo({ event }: { event: NeraiuchiEvent }) {
  return <div className={styles.info}>
    <p>{event.description}</p>
    <dl>
      <dt>開始（日本時間）</dt><dd>{formatJstDateTime(new Date(event.startsAt))}</dd>
      <dt>終了（この時刻以降は参加不可）</dt><dd>{formatJstDateTime(new Date(event.endsAt))}</dd>
      <dt>参加条件</dt><dd>無料・1アカウントにつき1企画1回</dd>
      <dt>当選内容</dt><dd>{event.rewardLabel}</dd>
      <dt>受け取り案内</dt><dd>{event.claimInstructions}</dd>
    </dl>
    <p>終了までは参加したことだけを表示します。番号・当落・参加人数は公開しません。当選品は終了後に画面の案内に従って受け取れます。</p>
  </div>;
}

export function EntryResult({ entry }: { entry: NeraiuchiEntry }) {
  if (!entry.resultsReleased) return <section className={styles.result} aria-live="polite">
    <h2>参加済みです</h2>
    <p>番号と当選結果は企画終了後に公開します。同じ企画への再参加はできません。</p>
  </section>;
  return <section className={styles.result} aria-live="polite" aria-atomic="true">
    <h2>{entry.isWinner ? "当選おめでとうございます！" : "今回は当選番号と一致しませんでした"}</h2>
    <p>あなたの参加番号：<strong>{entry.number}番</strong></p>
    <p>受付時刻：{formatJstDateTime(new Date(entry.acceptedAt))}</p>
    {entry.isWinner && <>
      <p>当選内容：{entry.rewardLabelSnapshot}</p>
      <p>{entry.claimInstructionsSnapshot}</p>
      <NeraiuchiPrizeClaim key={`${entry.eventId}:${entry.claim?.requestId ?? "unclaimed"}`} entry={entry} />
    </>}
    <p>参加済みです。同じ企画への再参加はできません。</p>
  </section>;
}
