"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callNeraiuchi } from "@/app/lib/neraiuchi";
import type { NeraiuchiAdminEvent } from "@/app/lib/neraiuchi";
import { parseJstDateTime } from "@/app/lib/dateTime";
import { quizDeadlineInput } from "@/app/lib/quizDeadline";
import { neraiuchiTitleBody } from "@/functions/src/neraiuchiTitle";
import { ErrorNotice, errorMessage } from "./NeraiuchiCommon";
import styles from "./neraiuchi.module.css";

const datetime = (value?: number) => value === undefined ? "" : quizDeadlineInput({ toMillis: () => value });
type PrizeInput = { number: string; label: string; points: string; shippingEnabled: boolean };

export default function NeraiuchiDraftForm({ event, onSaved }: { event?: NeraiuchiAdminEvent; onSaved?: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(neraiuchiTitleBody(event?.title ?? ""));
  const [description, setDescription] = useState(event?.description ?? "");
  const [startsAt, setStartsAt] = useState(datetime(event?.startsAt));
  const [endsAt, setEndsAt] = useState(datetime(event?.endsAt));
  const [maxEntries, setMaxEntries] = useState(String(event?.maxEntries ?? 100));
  const [prizes, setPrizes] = useState<PrizeInput[]>(event
    ? event.prizes.map((prize) => ({ ...prize, number: String(prize.number), points: String(prize.points) }))
    : [{ number: "1", label: "", points: "", shippingEnabled: false }]);
  const [claim, setClaim] = useState(event?.claimInstructions ?? "企画終了後に「当選品を受け取る」から受け取り方法を選択してください。");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const updatePrize = (index: number, changes: Partial<PrizeInput>) =>
    setPrizes((current) => current.map((prize, position) => position === index ? { ...prize, ...changes } : prize));
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const data = await callNeraiuchi("adminSaveNeraiuchiDraft", {
        ...(event ? { eventId: event.id, expectedVersion: event.version } : {}),
        title, description, thumbnailPath: "/menu/thumbnails/neraiuchi.png",
        startsAt: parseJstDateTime(startsAt).getTime(),
        endsAt: parseJstDateTime(endsAt).getTime(), maxEntries: Number(maxEntries),
        prizes: prizes.map((prize) => ({ ...prize, number: Number(prize.number), points: Number(prize.points) })),
        claimInstructions: claim,
      });
      if (onSaved) onSaved(); else router.push(`/admin/neraiuchi/${data.eventId}`);
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <form className={styles.form} onSubmit={save} aria-busy={busy}>
    <p>無料・1アカウント1企画1回。番号・当落・参加者一覧は企画終了後に公開します。公開後は設定を変更できません。</p>
    <label>企画名（80文字まで）<input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} disabled={busy} /></label>
    <p>タイトル先頭の<strong>【第n回】</strong>は公開時に自動で付き、編集できません。下書きの保存では開催回番号を消費しません。</p>
    <label>説明（2,000文字まで）<textarea value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={2000} disabled={busy} /></label>
    <label>開始日時（日本時間）<input type="datetime-local" step="1" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required disabled={busy} /></label>
    <label>終了日時（日本時間・この時刻から受付不可）<input type="datetime-local" step="1" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required disabled={busy} /></label>
    <label>参加上限（1〜10,000）<input type="number" min={1} max={10000} step={1} value={maxEntries} onChange={(e) => setMaxEntries(e.target.value)} required disabled={busy} /></label>
    <h2>非公開の当選番号と賞品（最大100枠）</h2>
    {prizes.map((prize, index) => <fieldset key={index} className={styles.prize} disabled={busy}>
      <legend>当選枠 {index + 1}</legend>
      <label>当選番号<input type="number" min={1} max={Number(maxEntries)} step={1}
        value={prize.number} onChange={(e) => updatePrize(index, { number: e.target.value })} required /></label>
      <label>賞品名（発送する商品名／ポイントの名称）<input value={prize.label} maxLength={200}
        onChange={(e) => updatePrize(index, { label: e.target.value })} required /></label>
      <label className={styles.checkbox}><input type="checkbox" checked={prize.shippingEnabled}
        onChange={(e) => updatePrize(index, { shippingEnabled: e.target.checked })} />この商品を発送できるようにする</label>
      <label>{prize.shippingEnabled ? "発送を選択しない場合のポイント" : "受け取りポイント"}
        <input type="number" min={prize.shippingEnabled ? 0 : 1} max={1000000} step={1}
          value={prize.points} onChange={(e) => updatePrize(index, { points: e.target.value })} required /></label>
      <button type="button" disabled={prizes.length === 1} onClick={() => setPrizes((current) => current.filter((_, position) => position !== index))}>
        当選枠 {index + 1}を削除
      </button>
    </fieldset>)}
    <button type="button" disabled={busy || prizes.length >= 100} onClick={() => setPrizes((current) => [
      ...current, { number: String(Number(current[current.length - 1].number) + 1), label: "", points: "", shippingEnabled: false },
    ])}>当選枠を追加</button>
    <label>受け取り案内（2,000文字まで・住所等の入力を求めない）<textarea value={claim} onChange={(e) => setClaim(e.target.value)} required maxLength={2000} disabled={busy} /></label>
    {error && <ErrorNotice error={error} />}
    <button type="submit" disabled={busy}>{busy ? "保存中…" : "下書きを保存"}</button>
  </form>;
}
