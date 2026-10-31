"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { callNeraiuchi } from "@/app/lib/neraiuchi";
import type { NeraiuchiResultRow } from "@/app/lib/neraiuchi";
import { formatJstDateTime } from "@/app/lib/dateTime";
import { ErrorNotice, errorMessage } from "./NeraiuchiCommon";
import styles from "./neraiuchi.module.css";

export function NeraiuchiResultTable({ rows }: { rows: (NeraiuchiResultRow & { uid?: string })[] }) {
  return <table className={styles.entries}>
    <caption>受付タイムスタンプ順（日本時間・同時刻は参加番号順）</caption>
    <thead><tr><th>参加番号</th><th>参加者／受付時刻</th><th>結果</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.number} data-self={row.isSelf} data-winner={row.isWinner}
      aria-current={row.isSelf ? "true" : undefined}
      className={[row.isWinner ? styles.winningRow : "", row.isSelf ? styles.ownRow : ""].join(" ")}>
      <td>{row.number}番</td>
      <td>{row.displayName}{row.isSelf && <strong className={styles.selfBadge}>あなた</strong>}
        {row.uid && <><br /><small>{row.uid}</small></>}
        <br /><time dateTime={new Date(row.acceptedAt).toISOString()}>
          {formatJstDateTime(new Date(row.acceptedAt)).replace(" JST", `.${String(Math.floor(row.acceptedAtNanoseconds / 1000)).padStart(6, "0")} JST`)}
        </time>
      </td>
      <td>{row.isWinner ? <><strong className={styles.winnerBadge}>当選</strong><br />{row.rewardLabel}</> : "対象外"}</td>
    </tr>)}</tbody>
  </table>;
}

export default function NeraiuchiResults({ eventId, participated }: { eventId: string; participated: boolean }) {
  const [items, setItems] = useState<NeraiuchiResultRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showOwn, setShowOwn] = useState(false);
  const table = useRef<HTMLDivElement>(null);
  const load = useCallback(async (position?: string, aroundSelf = false) => {
    setLoading(true); setError("");
    try {
      const data = await callNeraiuchi("getNeraiuchiResults", {
        eventId, ...(position ? { cursor: position } : {}), ...(aroundSelf ? { aroundSelf: true } : {}),
      });
      setItems((current) => position ? [...current, ...data.items] : data.items);
      setCursor(data.nextCursor); setShowOwn(aroundSelf);
    } catch (error) { setError(errorMessage(error)); }
    finally { setLoading(false); }
  }, [eventId]);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  useEffect(() => {
    if (showOwn) table.current?.querySelector('[data-self="true"]')?.scrollIntoView({ block: "center" });
  }, [items, showOwn]);
  return <section>
    <h2>参加者一覧・結果</h2>
    <p>青い印と「あなた」は自分の参加、黄色と「当選」は当選した参加です。50件ずつ表示します。</p>
    <div className={styles.actions}>
      <button type="button" disabled={loading} onClick={() => void load()}>先頭から表示・更新</button>
      {participated && <button type="button" disabled={loading} onClick={() => void load(undefined, true)}>自分の位置を表示</button>}
    </div>
    {error && <ErrorNotice error={error} retry={() => void load()} />}
    {loading && <p role="status">参加者一覧を取得中…</p>}
    {!loading && !error && !items.length && <p>この企画への参加はありませんでした。</p>}
    <div ref={table}><NeraiuchiResultTable rows={items} /></div>
    {cursor && <button type="button" disabled={loading} onClick={() => void load(cursor)}>次の50件</button>}
  </section>;
}
