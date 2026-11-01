"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { callNanika, NANIKA_TIERS, type NanikaReceipt, type NanikaSlot } from "@/app/lib/nanikaGacha";
import { NanikaFrame, nanikaError, useNanikaAuth } from "@/components/nanika-gacha/NanikaCommon";
import NanikaReceiptCard from "@/components/nanika-gacha/NanikaReceiptCard";
import styles from "@/components/nanika-gacha/nanika.module.css";

export default function NanikaGachaPage() {
  const { ready, uid } = useNanikaAuth();
  const [items, setItems] = useState<NanikaSlot[]>([]);
  const [selected, setSelected] = useState<NanikaSlot | null>(null);
  const [agree, setAgree] = useState(false);
  const [receipt, setReceipt] = useState<NanikaReceipt | null>(null);
  const [receiptOwner, setReceiptOwner] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [serverOffset, setServerOffset] = useState(0);
  const guard = useRef(false);
  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const result = await callNanika("listNanikaGacha", {});
      setItems(result.items.map(item => uid ? item : { ...item, remainingUses: 0 }));
      setServerOffset(result.serverNow - Date.now());
    }
    catch (error) { setError(nanikaError(error)); }
    finally { setLoading(false); }
  }, [ready, uid]);
  const updateReceipt = useCallback((next: NanikaReceipt) => { setReceipt(next); void load(); }, [load]);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  useEffect(() => {
    if (!animating) return;
    const timer = window.setTimeout(() => setAnimating(false), 3500);
    return () => window.clearTimeout(timer);
  }, [animating]);
  async function draw() {
    if (!selected || !uid || !agree || !selected.roundId || selected.fee === null || selected.exchangePoints === null || guard.current) return;
    if (!window.confirm(`${selected.fee}ポイントで抽選します。72時間以内に受取方法を選ばない場合は${selected.exchangePoints}ポイントに自動確定し、発送できなくなります。同意して抽選しますか？`)) return;
    guard.current = true; setBusy(true); setError("");
    const key = `nanika-gacha-request:${uid}:${selected.tier}:${selected.roundId}`;
    try {
      const requestId = localStorage.getItem(key) || crypto.randomUUID();
      localStorage.setItem(key, requestId);
      const result = await callNanika("drawNanikaGacha", {
        tier: selected.tier, roundId: selected.roundId, fee: selected.fee,
        exchangePoints: selected.exchangePoints, requestId, consent72h: true, participantUid: uid,
      });
      localStorage.removeItem(key); setReceipt(result.receipt); setReceiptOwner(uid); setSelected(null); setAgree(false);
      setAnimating(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      await load();
    } catch (error) { setError(`${nanikaError(error)} 成立した可能性がある場合は履歴を確認してください。再送時は同じリクエストIDを使用します。`); }
    finally { guard.current = false; setBusy(false); }
  }
  return <NanikaFrame title="何かの景品ガチャ">
    <p>画像そのものが景品になる専用ガチャです。通常ガチャとは別の企画です。</p>
    {!uid && ready && <p><Link href="/login">ログイン</Link>して、対象Xアカウントの参加枠を確認してください。</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <button type="button" disabled={loading || busy} onClick={() => { setError(""); setSelected(null); setAgree(false); void load(); }}>受付状況を再取得</button>
    {loading && <p>読み込み中…</p>}
    {!loading && !error && !items.some(item => item.visible) && <p>現在公開中の企画はありません。</p>}
    <div className={styles.grid}>{items.filter(item => item.visible).map(slot => {
      const t = NANIKA_TIERS.find(t => t.id === slot.tier)!;
      return <section className={styles.card} key={slot.tier}>
        <Image src={`/nanika-gacha/thumbnails/${t.thumbnail}.webp`} alt="" width={1536} height={1024} className={styles.thumbnail} />
        <h2>{t.label}</h2><p>参加費用：{slot.fee}ポイント／ポイント化：{slot.exchangePoints}ポイント</p>
        <p>抽選可能な景品：{slot.available}点／あなたの参加枠：{slot.remainingUses}回</p>
        <Link href={`/nanika-gacha/prizes/${slot.tier}`} className={styles.prizeListLink}>景品一覧を表示</Link>
        <button type="button" disabled={!uid || busy || slot.remainingUses < 1 || slot.available < 1 || animating}
          onClick={() => { setSelected(slot); setAgree(false); }}>参加条件を確認</button>
      </section>;
    })}</div>
    {selected && uid && <section className={styles.warning} aria-label="抽選前の確認">
      <h2>{NANIKA_TIERS.find(t => t.id === selected.tier)?.label}への参加確認</h2>
      <p>参加費用：<strong>{selected.fee}ポイント</strong>／ポイント化：<strong>{selected.exchangePoints}ポイント</strong></p>
      <p>対象Xアカウントの参加枠を1回消費します。参加費は発送／ポイント化のどちらでも返金されません。</p>
      <p><strong>抽選成立から72時間以内に受取方法を選ばなかった場合、自動で{selected.exchangePoints}ポイントに確定します。その後は当選品を発送できません。</strong></p>
      <label><input type="checkbox" checked={agree} disabled={busy} onChange={e => setAgree(e.target.checked)} />参加費用・受取ポイント・72時間後の自動ポイント化と発送不可に同意します</label>
      <button type="button" className={styles.confirm} disabled={!agree || busy} onClick={() => void draw()}>{busy ? "抽選結果を確認中…" : "最終確認して抽選する"}</button>
    </section>}
    {animating && receiptOwner === uid && <section className={styles.card} aria-live="polite">
      <h2>抽選結果の演出</h2><Image src="/gacha/win.gif" alt="抽選結果を表示する演出" unoptimized width={240} height={286} className={styles.prize} />
      <button type="button" onClick={() => setAnimating(false)}>演出をスキップして当選品を見る</button>
    </section>}
    {receipt && uid && receiptOwner === uid && !animating && <NanikaReceiptCard key={receipt.id} receipt={receipt} onChange={updateReceipt} serverOffset={serverOffset} />}
  </NanikaFrame>;
}
