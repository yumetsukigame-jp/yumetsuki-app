"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { callNeraiuchi } from "@/app/lib/neraiuchi";
import type { NeraiuchiEntry } from "@/app/lib/neraiuchi";
import LoadingState from "@/app/components/LoadingState";
import { EntryResult, ErrorNotice, errorMessage, LoginNotice, NeraiuchiFrame, useNeraiuchiAuth } from "@/components/neraiuchi/NeraiuchiCommon";
import styles from "@/components/neraiuchi/neraiuchi.module.css";

export default function NeraiuchiHistory() {
  const { ready, uid } = useNeraiuchiAuth();
  const [items, setItems] = useState<NeraiuchiEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (position?: string) => {
    if (!uid) return;
    setLoading(true); setError("");
    try {
      const data = await callNeraiuchi("getNeraiuchiHistory", position ? { cursor: position } : {});
      setItems((current) => position ? [...current, ...data.items] : data.items); setCursor(data.nextCursor);
    } catch (error) { setError(errorMessage(error)); }
    finally { setLoading(false); }
  }, [uid]);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  return <NeraiuchiFrame title="自分の狙い撃ち参加履歴">
    {!ready ? <LoadingState /> : !uid ? <LoginNotice /> : <>
      <button type="button" disabled={loading} onClick={() => void load()}>履歴・結果を更新</button>
      {error && <ErrorNotice error={error} retry={() => void load()} />}
      {loading && <LoadingState />}
      {!loading && !error && items.length === 0 && <p>参加履歴はまだありません。</p>}
      {items.map((entry) => <section className={styles.card} key={entry.eventId}>
        <h2><Link href={`/neraiuchi/${entry.eventId}`}>{entry.eventTitleSnapshot}</Link></h2>
        <EntryResult entry={entry} />
      </section>)}
      {cursor && <button type="button" disabled={loading} onClick={() => void load(cursor)}>次の20件</button>}
    </>}
  </NeraiuchiFrame>;
}
