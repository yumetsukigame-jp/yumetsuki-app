"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { callNanika, NANIKA_TIERS, type NanikaRound } from "@/app/lib/nanikaGacha";
import { formatJstDateTime } from "@/app/lib/dateTime";
import { useNanikaAuth, nanikaError } from "@/components/nanika-gacha/NanikaCommon";
import styles from "@/components/nanika-gacha/nanika.module.css";

export default function NanikaArchives() {
  const { uid } = useNanikaAuth();
  const [items, setItems] = useState<NanikaRound[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (position?: string) => {
    if (!uid) return;
    setBusy(true); setError("");
    try {
      const data = await callNanika("adminListNanikaArchives", position ? { cursor: position } : {});
      setItems(current => position ? [...current, ...data.items] : data.items); setCursor(data.nextCursor);
    } catch (error) { setError(nanikaError(error)); }
    finally { setBusy(false); }
  }, [uid]);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  async function resume(round: NanikaRound) {
    setBusy(true); setError("");
    try { await callNanika("adminEndNanikaGacha", { tier: round.tier, roundId: round.id, version: 0, confirmed: true }); await load(); }
    catch (error) { setError(nanikaError(error)); }
    finally { setBusy(false); }
  }
  return <div className={styles.page}><h1>何かの景品ガチャ：開催回アーカイブ</h1><Link href="/admin/nanika-gacha">専用ガチャ管理へ</Link>
    {!uid ? <p>管理者としてログインしてください。</p> : <>
      <button type="button" disabled={busy} onClick={() => void load()}>再取得</button>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {items.map(round => <section className={styles.card} key={round.id}>
        <h2>{NANIKA_TIERS.find(t => t.id === round.tier)?.label}</h2>
        <p>終了：{formatJstDateTime(new Date(round.closedAt))}／開催回ID：{round.id}</p>
        {round.archiveComplete ? <Link href={`/admin/nanika-gacha/results/${round.id}`}>参加者・抽選結果を表示</Link>
          : <button type="button" disabled={busy} onClick={() => void resume(round)}>未完了のアーカイブ移動を再開</button>}
      </section>)}
      {!busy && !error && items.length === 0 && <p>過去の開催回はありません。</p>}
      {cursor && <button type="button" disabled={busy} onClick={() => void load(cursor)}>次の20件</button>}
    </>}
  </div>;
}
