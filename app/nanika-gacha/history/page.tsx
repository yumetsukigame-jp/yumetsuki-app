"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { callNanika, type NanikaReceipt } from "@/app/lib/nanikaGacha";
import { NanikaFrame, useNanikaAuth, nanikaError } from "@/components/nanika-gacha/NanikaCommon";
import NanikaReceiptCard from "@/components/nanika-gacha/NanikaReceiptCard";
import styles from "@/components/nanika-gacha/nanika.module.css";

export default function NanikaHistoryPage() {
  const { ready, uid } = useNanikaAuth();
  const [items, setItems] = useState<NanikaReceipt[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadedUid, setLoadedUid] = useState<string | null>(null);
  const load = useCallback(async (position?: string) => {
    if (!uid) return;
    setLoading(true); setError("");
    try {
      const result = await callNanika("getNanikaGachaHistory", position ? { cursor: position } : {});
      setItems(current => position ? [...current, ...result.items] : result.items);
      setCursor(result.nextCursor); setOffset(result.serverNow - Date.now());
      setLoadedUid(uid);
    } catch (error) { setError(nanikaError(error)); }
    finally { setLoading(false); }
  }, [uid]);
  const refresh = useCallback(() => { void load(); }, [load]);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  return <NanikaFrame title="何かの景品ガチャ：自分の当選・受取履歴">
    {!ready ? <p>読み込み中…</p> : !uid ? <p><Link href="/login">ログインしてください</Link></p> : <>
      <button type="button" disabled={loading} onClick={refresh}>履歴を再取得</button>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!loading && !error && items.length === 0 && <p>当選記録はありません。</p>}
      {(loadedUid === uid ? items : []).map(item => <NanikaReceiptCard key={item.id} receipt={item} serverOffset={offset}
        onChange={next => setItems(current => current.map(item => item.id === next.id ? next : item))} />)}
      {loading && <p>読み込み中…</p>}
      {cursor && <button type="button" disabled={loading} onClick={() => void load(cursor)}>次の50件</button>}
    </>}
  </NanikaFrame>;
}
