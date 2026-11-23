"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { callNanika, NANIKA_TIERS, type NanikaReceipt, type NanikaSlot } from "@/app/lib/nanikaGacha";
import { NanikaFrame, nanikaError, useNanikaAuth } from "@/components/nanika-gacha/NanikaCommon";
import NanikaReceiptCard from "@/components/nanika-gacha/NanikaReceiptCard";
import GachaAnimation from "@/components/GachaAnimation";
import { resolveGachaAnimationLevel } from "@/functions/src/gachaAnimation";
import { formatJstDateTime } from "@/app/lib/dateTime";
import { nanikaDrawBlockReason, nanikaDrawCost } from "@/app/lib/nanikaGachaDisplay";
import styles from "@/components/nanika-gacha/nanika.module.css";

export default function NanikaGachaPage() {
  const { ready, uid } = useNanikaAuth();
  const [items, setItems] = useState<NanikaSlot[]>([]);
  const [selected, setSelected] = useState<NanikaSlot | null>(null);
  const [useRight, setUseRight] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [itemsOwner, setItemsOwner] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [receipt, setReceipt] = useState<NanikaReceipt | null>(null);
  const [receiptOwner, setReceiptOwner] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [serverOffset, setServerOffset] = useState(0);
  const [points, setPoints] = useState<number | null>(null);
  const guard = useRef(false);
  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const result = await callNanika("listNanikaGacha", {});
      setItems(result.items);
      setItemsOwner(uid);
      setPoints(result.points ?? null);
      setServerOffset(result.serverNow - Date.now());
    }
    catch (error) { setItemsOwner(null); setError(`ガチャの情報を読み込めませんでした。通信状況を確認して、もう一度お試しください。 ${nanikaError(error)}`); }
    finally { setLoading(false); }
  }, [ready, uid]);
  const updateReceipt = useCallback((next: NanikaReceipt) => { setReceipt(next); void load(); }, [load]);
  const finishAnimation = useCallback(() => setAnimating(false), []);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  async function draw() {
    if (!selected || !uid || selectedOwner !== uid || !agree || !selected.roundId || selected.fee === null || selected.exchangePoints === null || guard.current) return;
    if (nanikaDrawBlockReason(selected, useRight, points)) return;
    const fee = nanikaDrawCost(selected, useRight)!;
    if (!window.confirm(`${useRight ? "当選権利" : "挑戦権利"}を1回分使います。消費ポイント：${fee} pt。ポイントで受け取る場合：${selected.exchangePoints} pt。72時間以内に受取方法を選ばない場合は自動でポイントになり、発送できなくなります。この内容で引きますか？`)) return;
    guard.current = true; setBusy(true); setError("");
    const key = `nanika-gacha-request:${uid}:${selected.tier}:${selected.roundId}${useRight ? ":right" : ""}`;
    try {
      const requestId = localStorage.getItem(key) || crypto.randomUUID();
      localStorage.setItem(key, requestId);
      const result = await callNanika("drawNanikaGacha", {
        tier: selected.tier, roundId: selected.roundId, fee, useRight,
        exchangePoints: selected.exchangePoints, requestId, consent72h: true, participantUid: uid,
      });
      localStorage.removeItem(key); setReceipt(result.receipt); setReceiptOwner(uid); setSelected(null); setAgree(false);
      setAnimating(true);
      await load();
    } catch (error) { setError(`${nanikaError(error)} 抽選結果を確認できませんでした。もう一度引く前に、当選・受取をご確認ください。`); }
    finally { guard.current = false; setBusy(false); }
  }
  return <NanikaFrame title="何かの景品ガチャ">
    <section className={styles.hero}>
      <h2>候補は見える。中身は抽選でお楽しみ。</h2>
      <p>企画や購入で得た「何かのPSA」。その中身を、候補を見ながら抽選で決められます。</p>
      <Link href="/nanika-gacha/prizes" className={styles.prizeListLink}>景品候補を見る（ログイン不要）</Link>
    </section>
    {!uid && ready && <p>ガチャを引くには、<Link href="/login">ログイン</Link>してください。景品はログインせずに見られます。</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <button type="button" disabled={loading || busy} onClick={() => { setError(""); setSelected(null); setAgree(false); void load(); }}>最新の状態に更新</button>
    {loading && <p role="status">ガチャの情報を読み込んでいます…</p>}
    {uid && !loading && itemsOwner === uid && <section className={styles.card}>
      <h2>当選権利・挑戦権利</h2>
      <p>当選権利は1回分で引けます。追加のポイント消費はありません。</p>
      <p>挑戦権利は1回分と、ガチャに設定された消費ポイントを使います。0 ptならポイントは消費しません。</p>
      <p>どちらも選んだ種類の権利だけを1回分使います。</p>
      <p>現在のポイント：<strong>{points === null ? "確認できませんでした" : `${points.toLocaleString("ja-JP")} pt`}</strong></p>
      {!items.some(slot => slot.remainingRights > 0 || slot.remainingUses > 0) && <p>現在、ガチャを引ける回数はありません。当選権利または挑戦権利があると引けます。</p>}
      <p>当選権利は本人専用・期限なしで、次の開催回にも持ち越せます。挑戦権利は登録済みのXアカウントで利用でき、開催回終了後は持ち越せません。</p>
    </section>}
    {!loading && !error && !items.some(item => item.visible) && <p>ただいま準備中です。次の開催をお待ちください。</p>}
    <div className={styles.grid}>{items.map(slot => {
      const t = NANIKA_TIERS.find(t => t.id === slot.tier)!;
      const winningReason = nanikaDrawBlockReason(slot, true, points);
      const challengeReason = nanikaDrawBlockReason(slot, false, points);
      const own = Boolean(uid && itemsOwner === uid);
      return <section className={styles.card} key={slot.tier}>
        <Image src={`/nanika-gacha/thumbnails/${t.thumbnail}.webp`} alt="" width={1536} height={1024} className={styles.thumbnail} />
        <h2>{t.label}</h2>
        <p><strong>{!slot.visible ? "準備中" : slot.available < 1 ? "景品準備中" : "受付中"}</strong> · 景品候補：{slot.available}点</p>
        {slot.visible && <p className={styles.note}>公開日時：{slot.publishedAt == null ? "未記録" : formatJstDateTime(new Date(slot.publishedAt))}</p>}
        <p>ポイントで受け取る場合：<strong>{slot.exchangePoints === null ? "未設定" : `${slot.exchangePoints} pt`}</strong></p>
        <Link href={`/nanika-gacha/prizes/${slot.tier}`} className={styles.prizeListLink}>景品候補を見る</Link>
        <div className={styles.rightOption}>
          <p>当選権利：<strong>{own ? `${slot.remainingRights}回分` : "ログインして確認"}</strong></p>
          <p>追加で使うポイント：<strong>0 pt</strong></p>
          <button type="button" disabled={!own || loading || busy || Boolean(winningReason) || animating}
            onClick={() => { setSelected(slot); setSelectedOwner(uid); setUseRight(true); setAgree(false); }}>当選権利で引く</button>
          {own && winningReason && <p className={styles.note}>{winningReason}</p>}
        </div>
        <div className={styles.rightOption}>
          <p>挑戦権利：<strong>{own ? `${slot.remainingUses}回分` : "ログインして確認"}</strong></p>
          <p>消費ポイント：<strong>{slot.fee === null ? "未設定" : `${slot.fee} pt`}</strong></p>
          <button type="button" disabled={!own || loading || busy || Boolean(challengeReason) || animating}
            onClick={() => { setSelected(slot); setSelectedOwner(uid); setUseRight(false); setAgree(false); }}>挑戦権利で引く</button>
          {own && challengeReason && <p className={styles.note}>{challengeReason}</p>}
        </div>
      </section>;
    })}</div>
    {selected && uid && selectedOwner === uid && <section className={styles.warning} aria-label="抽選前の確認">
      <h2>{NANIKA_TIERS.find(t => t.id === selected.tier)?.label}：抽選前の確認</h2>
      <p>使う権利：<strong>{useRight ? "当選権利" : "挑戦権利"} 1回分</strong></p>
      <p>消費ポイント：<strong>{nanikaDrawCost(selected, useRight)} pt</strong></p>
      <p>ポイントで受け取る場合：<strong>{selected.exchangePoints} pt</strong></p>
      <p>もう一方の権利は使いません。抽選後は権利や消費ポイントを返還できません。</p>
      <p><strong>抽選成立から72時間以内に受取方法を選ばなかった場合、自動で{selected.exchangePoints}ポイントに確定します。その後は当選品を発送できません。</strong></p>
      <label><input type="checkbox" checked={agree} disabled={busy} onChange={e => setAgree(e.target.checked)} />使う権利・消費ポイント・受取ポイントを確認しました。当選から72時間以内に受取方法を選びます。期限を過ぎると自動でポイントになり、発送できなくなることに同意します。</label>
      <button type="button" className={styles.confirm} disabled={!agree || busy || Boolean(nanikaDrawBlockReason(selected, useRight, points))} onClick={() => void draw()}>{busy ? "景品を確認しています…" : "この内容で引く"}</button>
      <button type="button" disabled={busy} onClick={() => { setSelected(null); setAgree(false); }}>戻る</button>
    </section>}
    {animating && receipt && receiptOwner === uid && <GachaAnimation level={resolveGachaAnimationLevel(receipt.animationLevel)} onComplete={finishAnimation} />}
    {receipt && uid && receiptOwner === uid && !animating && <NanikaReceiptCard key={receipt.id} receipt={receipt} onChange={updateReceipt} serverOffset={serverOffset} />}
  </NanikaFrame>;
}
