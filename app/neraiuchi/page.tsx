"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { callNeraiuchi, neraiuchiEnabled, availabilityLabels } from "@/app/lib/neraiuchi";
import type { NeraiuchiEvent } from "@/app/lib/neraiuchi";
import { formatJstDateTime } from "@/app/lib/dateTime";
import LoadingState from "@/app/components/LoadingState";
import MenuImageCard from "@/components/home/MenuImageCard";
import { ErrorNotice, errorMessage, LoginNotice, NeraiuchiFrame, useNeraiuchiAuth } from "@/components/neraiuchi/NeraiuchiCommon";
import styles from "@/components/neraiuchi/neraiuchi.module.css";

export default function NeraiuchiList() {
  const { ready, uid } = useNeraiuchiAuth();
  const [items, setItems] = useState<NeraiuchiEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [serverEnabled, setServerEnabled] = useState(false);
  const load = useCallback(async (position?: string) => {
    if (!uid) return;
    setLoading(true); setError("");
    try {
      const data = await callNeraiuchi("listNeraiuchiEvents", position ? { cursor: position } : {});
      setItems((current) => position ? [...current, ...data.items] : data.items);
      setCursor(data.nextCursor); setServerEnabled(data.enabled);
    } catch (error) { setError(errorMessage(error)); }
    finally { setLoading(false); }
  }, [uid]);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  return <NeraiuchiFrame title="ゆめつきの狙い撃ち">
    {!ready ? <LoadingState /> : !uid ? <LoginNotice /> : <>
      {error && <ErrorNotice error={error} retry={() => void load()} />}
      {loading && <LoadingState />}
      {!loading && !error && (!neraiuchiEnabled || !serverEnabled)
        ? <p>狙い撃ちは現在公開準備中、または新規参加を停止しています。保存済みの参加履歴は確認できます。</p>
        : !loading && !error && items.length === 0
          ? <p>現在開催中の企画はありません。</p> : null}
      {neraiuchiEnabled && serverEnabled && items.map((event) => <section key={event.id} className={styles.card}>
        <span className={styles.status}>{availabilityLabels[event.availability]}</span>
        <MenuImageCard item={{ label: event.title, href: `/neraiuchi/${event.id}`, image: "neraiuchi", description: event.description }} />
        <p>受付：{formatJstDateTime(new Date(event.startsAt))}〜{formatJstDateTime(new Date(event.endsAt))}</p>
        <Link href={`/neraiuchi/${event.id}`}>企画の詳細を確認</Link>
      </section>)}
      {cursor && <button type="button" disabled={loading} onClick={() => void load(cursor)}>次の20件</button>}
    </>}
  </NeraiuchiFrame>;
}
