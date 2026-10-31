"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { callNeraiuchi } from "@/app/lib/neraiuchi";
import type { NeraiuchiAdminEvent, NeraiuchiRevealedEntry } from "@/app/lib/neraiuchi";
import LoadingState from "@/app/components/LoadingState";
import { EventInfo, ErrorNotice, errorMessage, LoginNotice, useNeraiuchiAuth } from "@/components/neraiuchi/NeraiuchiCommon";
import NeraiuchiDraftForm from "@/components/neraiuchi/NeraiuchiDraftForm";
import { NeraiuchiResultTable } from "@/components/neraiuchi/NeraiuchiResults";
import styles from "@/components/neraiuchi/neraiuchi.module.css";

export default function AdminNeraiuchiDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const { ready, uid } = useNeraiuchiAuth();
  const [event, setEvent] = useState<NeraiuchiAdminEvent | null>(null);
  const [entries, setEntries] = useState<(NeraiuchiRevealedEntry & { uid: string; displayName: string; isSelf: boolean; acceptedAtNanoseconds: number })[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [entriesError, setEntriesError] = useState("");
  const [reason, setReason] = useState("");
  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true); setError("");
    try { setEvent((await callNeraiuchi("adminGetNeraiuchiEvent", { eventId: id })).event); }
    catch (error) { setError(errorMessage(error)); setEvent(null); }
    finally { setLoading(false); }
  }, [id, uid]);
  const loadEntries = useCallback(async (position?: string) => {
    if (!uid) return;
    setEntriesLoading(true); setEntriesError("");
    try {
      const data = await callNeraiuchi("adminListNeraiuchiEntries", { eventId: id, ...(position ? { cursor: position } : {}) });
      setEntries((current) => position ? [...current, ...data.items] : data.items); setCursor(data.nextCursor);
    } catch (error) { setEntriesError(errorMessage(error)); }
    finally { setEntriesLoading(false); }
  }, [id, uid]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const operate = async (operation: "publish" | "close" | "archive") => {
    if (!event || busy) return;
    const confirmation = operation === "publish"
      ? `「${event.title}」を公開しますか？\n${event.prizes.map((prize) => `${prize.number}番：${prize.label}／${prize.points}pt${prize.shippingEnabled ? "（発送選択可）" : ""}`).join("\n")}\n参加上限：${event.maxEntries}\n終了まで番号・当落・参加者一覧は非公開。公開後は設定変更できません。`
      : operation === "close" ? "受付を終了しますか？再受付はできません。" : "終了済み企画をアーカイブしますか？参加履歴は保持します。";
    if (!confirm(confirmation)) return;
    setBusy(true); setError("");
    const args = { eventId: id, expectedVersion: event.version };
    try {
      if (operation === "publish") await callNeraiuchi("adminPublishNeraiuchi", args);
      else if (operation === "close") await callNeraiuchi("adminCloseNeraiuchi", { ...args, reason });
      else await callNeraiuchi("adminArchiveNeraiuchi", args);
      await load();
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <div className={styles.page}>
    <h1>狙い撃ち設定・結果</h1><Link href="/admin/neraiuchi">管理一覧へ</Link>
    {!ready ? <LoadingState /> : !uid ? <LoginNotice /> : <>
      {error && <ErrorNotice error={error} retry={() => void load()} />}
      {loading && <LoadingState />}
      {event && <>
        <h2>{event.title}（{event.state}／設定版{event.version}）</h2>
        {event.state === "draft" && <NeraiuchiDraftForm key={event.version} event={event} onSaved={() => void load()} />}
        <h2>公開前プレビュー／凍結された条件</h2>
        <EventInfo event={event} />
        <div className={styles.info}>
          <p>管理者のみ：当選番号 {event.winningNumbers.join(", ")}</p>
          <ul>{event.prizes.map((prize) => <li key={prize.number}>
            {prize.number}番：{prize.label}／{event.rewardMode === "manual" ? "旧企画・手動受け取り" : `${prize.points}pt／${prize.shippingEnabled ? "発送またはポイント" : "ポイント"}`}
          </li>)}</ul>
          <p>参加上限：{event.maxEntries}／受付済み：{event.acceptedCount}</p>
          <p>未到達の当選番号：{event.winningNumbers.filter((number) => number > event.acceptedCount).join(", ") || "なし"}</p>
          <p>一般利用者へ番号・当落・参加総数は終了まで返しません。終了操作後は参加者結果とともにアーカイブへ移動します。日時による終了は5分間隔の処理で移動します。上限到達だけでは結果を公開しません。機能フラグは既定OFFです。</p>
        </div>
        {event.state === "published" && <label className={styles.form}>
          終了理由（監査記録に保存）<textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} disabled={busy} />
        </label>}
        <div className={styles.actions} aria-busy={busy}>
          {event.state === "draft" && <button type="button" disabled={busy || loading} onClick={() => void operate("publish")}>設定を凍結して公開</button>}
          {event.state === "published" && <button type="button" disabled={busy || loading || !reason.trim()} onClick={() => void operate("close")}>受付を終了</button>}
          {event.state === "closed" && <button type="button" disabled={busy || loading} onClick={() => void operate("archive")}>アーカイブ</button>}
          <button type="button" disabled={busy || loading || entriesLoading} onClick={() => void loadEntries()}>参加結果を取得・更新</button>
        </div>
        {entriesError && <ErrorNotice error={entriesError} retry={() => void loadEntries()} />}
        {entriesLoading && <LoadingState />}
        {entries.length > 0 && <NeraiuchiResultTable rows={entries.map((entry) => ({
          number: entry.number, acceptedAt: entry.acceptedAt, acceptedAtNanoseconds: entry.acceptedAtNanoseconds, displayName: entry.displayName,
          uid: entry.uid, isSelf: entry.isSelf, isWinner: entry.isWinner, rewardLabel: entry.rewardLabelSnapshot,
        }))} />}
        {cursor && <button type="button" disabled={entriesLoading} onClick={() => void loadEntries(cursor)}>次の50件</button>}
      </>}
    </>}
  </div>;
}
