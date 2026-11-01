"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { callNanika, NANIKA_TIERS, type NanikaSlot } from "@/app/lib/nanikaGacha";
import { useNanikaAuth, nanikaError } from "@/components/nanika-gacha/NanikaCommon";
import styles from "@/components/nanika-gacha/nanika.module.css";
import { formatJstDateTime } from "@/app/lib/dateTime";

function SlotForm({ slot, onSaved }: { slot: NanikaSlot; onSaved: (items: NanikaSlot[]) => void }) {
  const [fee, setFee] = useState(slot.fee === null ? "" : String(slot.fee));
  const [points, setPoints] = useState(slot.exchangePoints === null ? "" : String(slot.exchangePoints));
  const [visible, setVisible] = useState(slot.visible);
  const [accounts, setAccounts] = useState((slot.xAccounts ?? []).join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await callNanika("adminSaveNanikaGacha", {
        tier: slot.tier, fee: Number(fee), exchangePoints: Number(points), version: slot.version,
        visible, xAccounts: accounts.split(/\r?\n/).map(line => line.trim()).filter(Boolean),
      });
      onSaved(result.items);
    } catch (error) { setError(nanikaError(error)); }
    finally { setBusy(false); }
  }
  async function end() {
    if (!slot.roundId || busy || !window.confirm("この開催回を終了してアーカイブします。対象Xの残り参加枠は引き継がれません。未受取の当選品は72時間の期限内で引き続き受け取れます。終了しますか？")) return;
    setBusy(true); setError("");
    try {
      onSaved((await callNanika("adminEndNanikaGacha", { tier: slot.tier, roundId: slot.roundId, version: slot.version, confirmed: true })).items);
    } catch (error) { setError(`${nanikaError(error)} アーカイブ移動が未完了の場合は、アーカイブ画面から再開できます。`); }
    finally { setBusy(false); }
  }
  return <section className={styles.card}>
    <h2>{NANIKA_TIERS.find(t => t.id === slot.tier)?.label}</h2>
    <p>抽選可能な画像：{slot.available}点／開催回：{slot.roundId ?? "未作成"}</p>
    <p>公開日時：{slot.publishedAt == null ? "未記録" : formatJstDateTime(new Date(slot.publishedAt))}</p>
    <form onSubmit={save}>
      <label>参加費用（ポイント）<input type="number" required min={0} max={1000000} step={1} value={fee} disabled={busy} onChange={e => setFee(e.target.value)} /></label>
      <label>ポイント化の受取ポイント<input type="number" required min={0} max={1000000} step={1} value={points} disabled={busy} onChange={e => setPoints(e.target.value)} /></label>
      <label><input type="checkbox" checked={visible} disabled={busy} onChange={e => setVisible(e.target.checked)} />全体に表示・受付する（外すと受付停止のみ）</label>
      <p>非公開から公開へ切り替えると、公開日時を更新します。公開中の設定変更では日時は変わりません。</p>
      <label>残り対象X一覧（1行1回・最大5000行）<textarea rows={6} value={accounts} disabled={busy} placeholder="@account" onChange={e => setAccounts(e.target.value)} /></label>
      <p>抽選で消費済みの行は一覧から減ります。追加する際は最新の残り一覧を再取得してから編集してください。金額変更は新しい抽選だけに適用されます。</p>
      <button type="submit" disabled={busy}>設定を保存</button>
    </form>
    {slot.roundId && <div className={styles.actions}>
      <Link href={`/admin/nanika-gacha/results/${slot.roundId}`}>この開催回の抽選結果</Link>
      <button type="button" disabled={busy} className={styles.danger} onClick={() => void end()}>終了して次回へ</button>
    </div>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </section>;
}

export default function AdminNanikaGacha() {
  const { ready, uid } = useNanikaAuth();
  const [items, setItems] = useState<NanikaSlot[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true); setError(""); setItems([]);
    try { setItems((await callNanika("adminGetNanikaGacha", {})).items); }
    catch (error) { setError(nanikaError(error)); }
    finally { setLoading(false); }
  }, [uid]);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  return <div className={styles.page}>
    <h1>何かの景品ガチャ管理</h1>
    <nav className={styles.nav}><Link href="/admin">管理者トップ</Link><Link href="/admin/nanika-gacha/images">専用画像管理</Link><Link href="/admin/nanika-gacha/archive">開催回アーカイブ</Link></nav>
    {!ready || loading ? <p>読み込み中…</p> : !uid ? <p>管理者としてログインしてください。</p> : <>
      <button type="button" onClick={() => void load()}>最新設定を再取得（未保存の編集は破棄）</button>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {items.map(slot => <SlotForm key={`${slot.tier}:${slot.version}`} slot={slot} onSaved={setItems} />)}
    </>}
  </div>;
}
