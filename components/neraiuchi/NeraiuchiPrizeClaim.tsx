"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { callNeraiuchi } from "@/app/lib/neraiuchi";
import type { NeraiuchiRevealedEntry } from "@/app/lib/neraiuchi";
import { ErrorNotice, errorMessage } from "./NeraiuchiCommon";
import styles from "./neraiuchi.module.css";

export default function NeraiuchiPrizeClaim({ entry }: { entry: NeraiuchiRevealedEntry }) {
  const router = useRouter();
  const [claim, setClaim] = useState(entry.claim);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const prize = entry.prize;
  if (!prize) return null;

  const reload = async () => {
    setBusy(true); setError("");
    try {
      const data = await callNeraiuchi("getNeraiuchiEvent", { eventId: entry.eventId });
      if (!data.entry?.resultsReleased) throw new Error("受け取り記録を確認できませんでした");
      setClaim(data.entry.claim);
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  };
  const receive = async (choice: "points" | "shipping") => {
    if (busy || claim) return;
    if (!confirm(`${choice === "shipping" ? `${prize.label}の発送` : `${prize.points}ポイントの受け取り`}を確定しますか？確定後は変更できません。`)) return;
    setBusy(true); setError("");
    try {
      const data = await callNeraiuchi("claimNeraiuchiPrize", { eventId: entry.eventId, choice });
      if (!data.entry.claim) throw new Error("受け取り記録を再取得して確認してください");
      setClaim(data.entry.claim);
      sessionStorage.removeItem("home-user");
      if (choice === "shipping") router.push("/reward/complete");
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <div aria-busy={busy}>
    {claim ? <>
      <p>{claim.choice === "shipping" ? "発送依頼は受付済みです。" : `${prize.points}ポイントを受け取り済みです。`}再度受け取ることはできません。</p>
      {claim.choice === "shipping" && <Link href="/history">発送履歴を確認</Link>}
    </> : <>
      <button type="button" disabled={busy} onClick={() => setChoosing(true)}>当選品を受け取る</button>
      {choosing && <fieldset className={styles.prize} disabled={busy}>
        <legend>受け取り方法を選択</legend>
        <p>{prize.shippingEnabled
          ? "商品を発送するか、代わりにポイントを受け取るか選んでください。発送を選ぶとポイントは付与されません。"
          : "この当選品はポイントで受け取れます。"}</p>
        <p>選択・確定するまで受け取りは保留されます。画面を離れても後から選べます。確定後は変更できません。</p>
        <div className={styles.actions}>
          {prize.shippingEnabled && <button type="button" onClick={() => void receive("shipping")}>この商品を発送する</button>}
          <button type="button" onClick={() => void receive("points")}>{prize.points}ポイントで受け取る</button>
        </div>
      </fieldset>}
    </>}
    {error && <ErrorNotice error={error} retry={() => void reload()} />}
    <button type="button" disabled={busy} onClick={() => void reload()}>受取状況を再取得</button>
  </div>;
}
