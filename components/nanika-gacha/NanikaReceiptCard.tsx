"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { callNanika, type NanikaReceipt, NANIKA_TIERS } from "@/app/lib/nanikaGacha";
import { formatJstDateTime } from "@/app/lib/dateTime";
import { nanikaError } from "./NanikaCommon";
import styles from "./nanika.module.css";

export default function NanikaReceiptCard({ receipt, onChange, serverOffset = 0, onExpired }: {
  receipt: NanikaReceipt; onChange: (next: NanikaReceipt) => void;
  serverOffset?: number; onExpired?: () => void;
}) {
  const [confirmPoints, setConfirmPoints] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState(false);
  const [clockOffset, setClockOffset] = useState<number | null>(null);
  const [deadlinePassed, setDeadlinePassed] = useState(() => Date.now() + serverOffset >= receipt.deadline);
  const guard = useRef(false);
  useEffect(() => {
    if (receipt.choice !== "pending") return;
    const delay = Math.max(0, receipt.deadline - Date.now() - (clockOffset ?? serverOffset));
    const timer = window.setTimeout(() => {
      setDeadlinePassed(true);
      void callNanika("getNanikaGachaReceipt", { id: receipt.id }).then(result => {
        setClockOffset(result.serverNow - Date.now());
        setDeadlinePassed(result.serverNow >= result.receipt.deadline);
        if (result.receipt.choice !== "pending") { onChange(result.receipt); onExpired?.(); }
      }).catch(error => setError(nanikaError(error)));
    }, Math.min(delay + 1000, 2147483647));
    return () => window.clearTimeout(timer);
  }, [receipt.id, receipt.choice, receipt.deadline, serverOffset, clockOffset, onChange, onExpired]);
  async function claim(choice: "points" | "shipping") {
    if (guard.current || deadlinePassed || (choice === "points" && !agree)) return;
    const message = choice === "points"
      ? `${receipt.name}を${receipt.exchangePoints}ポイントに確定します。取り消せず、この当選品を発送することはできません。確定しますか？`
      : `${receipt.name}の発送を依頼します。ポイント受取には変更できません。72時間の期限を過ぎている場合は自動でポイントになります。確定しますか？`;
    if (!window.confirm(message)) return;
    guard.current = true; setBusy(true); setError("");
    try {
      const result = await callNanika("claimNanikaGacha", { id: receipt.id, choice, confirmed: true });
      onChange(result.receipt);
    } catch (error) { setError(nanikaError(error)); }
    finally { guard.current = false; setBusy(false); }
  }
  return <section className={styles.card} aria-live="polite">
    <h2>{NANIKA_TIERS.find(t => t.id === receipt.tier)?.label}：{receipt.name}</h2>
    <Image src={receipt.image} alt={receipt.name} width={400} height={400} unoptimized className={styles.prize}
      onError={() => setImageError(true)} />
    {imageError && <p role="alert">画像を取得できませんでした。ページを再読み込みしてください。</p>}
    <p>使用した権利：{receipt.usedRight ? "当選権利" : "挑戦権利"} 1回分</p>
    <p>消費ポイント：{receipt.fee} pt</p>
    <p>ポイントで受け取る場合：{receipt.exchangePoints} pt</p>
    <p>抽選日時：{formatJstDateTime(new Date(receipt.acceptedAt))}</p>
    {receipt.choice === "pending" ? <>
      <div className={styles.warning}>
        <p><strong>受取方法の選択期限：{formatJstDateTime(new Date(receipt.deadline))}（日本時間）</strong></p>
        <p>72時間を過ぎると自動で{receipt.exchangePoints} ptになり、発送できなくなります。画面を閉じても期限は進みます。</p>
        {deadlinePassed && <p role="status"><strong>期限を過ぎました。ポイント受取の反映を待っています。</strong></p>}
      </div>
      {!deadlinePassed && <>
      <h2>受取方法を選んでください</h2>
      <div className={styles.actions}>
        <button type="button" disabled={busy} onClick={() => void claim("shipping")}>発送を依頼</button>
        <button type="button" disabled={busy} onClick={() => { setConfirmPoints(true); setAgree(false); }}>ポイントで受け取る</button>
        <Link href="/nanika-gacha/history" className={styles.laterLink} aria-disabled={busy}
          onClick={event => { if (busy) event.preventDefault(); }}>あとで選ぶ</Link>
      </div>
      {confirmPoints && <section className={styles.warning} aria-label="ポイント受取の最終確認">
        <h2>ポイントで受け取りますか？</h2>
        <p>景品：<strong>{receipt.name}</strong>／受取：<strong>{receipt.exchangePoints}ポイント</strong></p>
        <p>上の画像の景品は発送されません。確定後は発送に変更できず、取り消せません。</p>
        <label><input type="checkbox" checked={agree} disabled={busy} onChange={e => setAgree(e.target.checked)} />画像・景品名・受取ポイントを確認し、発送できなくなることに同意します</label>
        <button type="button" className={styles.danger} disabled={busy || !agree} onClick={() => void claim("points")}>{busy ? "受取状況を確認しています…" : "ポイント受取を確定"}</button>
        <button type="button" disabled={busy} onClick={() => setConfirmPoints(false)}>選択に戻る</button>
      </section>}
      </>}
    </> : <p><strong>{receipt.choice === "shipping" ? "発送依頼済み" : `${receipt.exchangePoints}ポイント受取済み${receipt.automatic ? "（72時間経過による自動確定）" : ""}`}</strong>
      {receipt.choice === "shipping" && <> — <Link href="/history">発送状況を見る</Link></>}</p>}
    {error && <p role="alert" className={styles.error}>{error} 受取状況を確認できませんでした。履歴を更新して、確定しているかご確認ください。</p>}
  </section>;
}
