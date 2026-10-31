"use client";

import React, { useCallback, useEffect, useState } from "react";
import { callNeraiuchi, availabilityLabels } from "@/app/lib/neraiuchi";
import type { NeraiuchiEntry, NeraiuchiEvent } from "@/app/lib/neraiuchi";
import LoadingState from "@/app/components/LoadingState";
import { EntryResult, EventInfo, ErrorNotice, errorMessage, LoginNotice, NeraiuchiFrame, useNeraiuchiAuth } from "@/components/neraiuchi/NeraiuchiCommon";
import styles from "@/components/neraiuchi/neraiuchi.module.css";
import NeraiuchiResults from "@/components/neraiuchi/NeraiuchiResults";

export default function NeraiuchiDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const { ready, uid } = useNeraiuchiAuth();
  const [event, setEvent] = useState<NeraiuchiEvent | null>(null);
  const [entry, setEntry] = useState<NeraiuchiEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(false);
  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true); setError("");
    try {
      const data = await callNeraiuchi("getNeraiuchiEvent", { eventId: id });
      setEvent(data.event); setEntry(data.entry); setRecovery(false);
    } catch (error) { setError(errorMessage(error)); }
    finally { setLoading(false); }
  }, [id, uid]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const join = async () => {
    if (busy || entry || recovery) return;
    if (!confirm("無料・1アカウントにつき1企画1回です。サーバーで確定した順に番号を割り当てます。参加しますか？")) return;
    setBusy(true); setError("");
    try {
      const data = await callNeraiuchi("joinNeraiuchi", { eventId: id });
      setEntry(data.entry);
    } catch (error) {
      setRecovery(true);
      setError(`${errorMessage(error)} 通信が中断しても参加済みの可能性があります。「再取得」で結果を確認してください。`);
    } finally { setBusy(false); }
  };
  return <NeraiuchiFrame title={event?.title ?? "ゆめつきの狙い撃ち"}>
    {!ready ? <LoadingState /> : !uid ? <LoginNotice /> : <>
      {error && <ErrorNotice error={error} retry={() => void load()} />}
      {loading && <LoadingState />}
      {event && <>
        <span className={styles.status}>{availabilityLabels[event.availability]}</span>
        <EventInfo event={event} />
        <p>番号はサーバーで確定した順番です。企画終了までは自分の番号・当落も公開しません。</p>
        {entry ? <EntryResult entry={entry} /> : <>
          <button type="button" onClick={() => void join()}
            disabled={busy || loading || recovery || event.availability !== "open"} aria-busy={busy}>
            {busy ? "参加結果を確認中…" : "狙い撃ちに参加！"}
          </button>
          <button type="button" disabled={busy || loading} onClick={() => void load()} style={{ marginLeft: 8 }}>受付状態を再取得</button>
          <p>受付状態は取得時点のものです。参加可否はサーバーの現在時刻で再確認します。</p>
        </>}
        <button type="button" disabled={busy || loading} onClick={() => void load()}>参加状況・結果を再取得</button>
        {event.resultsReleased && <NeraiuchiResults eventId={id} participated={Boolean(entry)} />}
      </>}
    </>}
  </NeraiuchiFrame>;
}
