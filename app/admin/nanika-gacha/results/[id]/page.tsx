"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { callNanika, type NanikaReceipt } from "@/app/lib/nanikaGacha";
import { formatJstDateTime } from "@/app/lib/dateTime";
import { useNanikaAuth, nanikaError } from "@/components/nanika-gacha/NanikaCommon";
import styles from "@/components/nanika-gacha/nanika.module.css";

export default function NanikaResults() {
  const { id } = useParams<{ id: string }>();
  const { uid } = useNanikaAuth();
  const [items, setItems] = useState<(NanikaReceipt & { uid: string })[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (position?: string) => {
    if (!uid) return;
    setBusy(true); setError("");
    try {
      const result = await callNanika("adminListNanikaEntries", { roundId: id, ...(position ? { cursor: position } : {}) });
      setItems(current => position ? [...current, ...result.items] : result.items); setCursor(result.nextCursor);
    } catch (error) { setError(nanikaError(error)); }
    finally { setBusy(false); }
  }, [uid, id]);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  return <div className={styles.page}><h1>何かの景品ガチャ：抽選結果</h1><Link href="/admin/nanika-gacha">専用ガチャ管理へ</Link>
    {!uid ? <p>管理者としてログインしてください。</p> : <>
      <button type="button" disabled={busy} onClick={() => void load()}>再取得</button>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {items.map(item => <section className={styles.card} key={item.id}>
        <h2>{item.name}</h2><p>参加者UID：{item.uid}／状態：{item.choice}{item.automatic && "（自動ポイント化）"}</p>
        <p>受付：{formatJstDateTime(new Date(item.acceptedAt))}／選択期限：{formatJstDateTime(new Date(item.deadline))}</p>
        <p>参加費用：{item.fee}／受取ポイント：{item.exchangePoints}</p><a href={item.image}>当選画像を表示</a>
      </section>)}
      {!busy && !error && items.length === 0 && <p>参加記録はありません。</p>}
      {cursor && <button type="button" disabled={busy} onClick={() => void load(cursor)}>次の50件</button>}
    </>}
  </div>;
}
