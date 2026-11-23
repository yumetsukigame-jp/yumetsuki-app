"use client";

import { useCallback, useEffect, useState } from "react";
import { callNanika, NANIKA_TIERS, type NanikaRightHolder, type NanikaTier } from "@/app/lib/nanikaGacha";
import { nanikaError } from "./NanikaCommon";
import styles from "./nanika.module.css";

export default function NanikaRightHolders() {
  const [tier, setTier] = useState<NanikaTier>("psa");
  const [items, setItems] = useState<NanikaRightHolder[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async (nextCursor?: string) => {
    setBusy(true); setError("");
    if (!nextCursor) { setItems([]); setCursor(null); }
    try {
      const result = await callNanika("adminListNanikaRights", { tier, ...(nextCursor ? { cursor: nextCursor } : {}) });
      setItems(previous => nextCursor ? [...previous, ...result.items] : result.items);
      setCursor(result.nextCursor);
    } catch (error) { setError(nanikaError(error)); }
    finally { setBusy(false); }
  }, [tier]);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  return <section className={styles.card}>
    <h2>当選権利の保有者</h2>
    <p>通常ガチャ・ポイント交換で付与した未使用の当選権利です。挑戦権利（対象X一覧）とは別に管理され、開催回を終了しても残ります。抽選時の追加消費は0 ptです。</p>
    <label>種類<select value={tier} disabled={busy} onChange={event => setTier(event.target.value as NanikaTier)}>
      {NANIKA_TIERS.map(tier => <option key={tier.id} value={tier.id}>{tier.label}</option>)}
    </select></label>
    <button type="button" disabled={busy} onClick={() => void load()}>保有者一覧を再取得</button>
    {items.length > 0 && <table>
      <thead><tr><th>利用者</th><th>Xアカウント</th><th>残り権利</th></tr></thead>
      <tbody>{items.map(holder => <tr key={holder.uid}><td>{holder.name || holder.uid}</td><td>{holder.xAccount || "未登録"}</td><td>{holder.remainingRights}回分</td></tr>)}</tbody>
    </table>}
    {!busy && !error && items.length === 0 && <p>この種類の権利保有者はいません。</p>}
    {cursor && <button type="button" disabled={busy} onClick={() => void load(cursor)}>続きを表示</button>}
    {busy && <p>読み込み中…</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
