"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { callNeraiuchi, neraiuchiEnabled, availabilityLabels } from "@/app/lib/neraiuchi";
import type { NeraiuchiEntry, NeraiuchiListedEvent } from "@/app/lib/neraiuchi";
import { nextNeraiuchiBoundary } from "@/app/lib/neraiuchiDisplay";
import { formatJstDateTime } from "@/app/lib/dateTime";
import LoadingState from "@/app/components/LoadingState";
import MenuImageCard from "@/components/home/MenuImageCard";
import NeraiuchiParticipationButton from "@/components/neraiuchi/NeraiuchiParticipationButton";
import { ErrorNotice, errorMessage, LoginNotice, NeraiuchiFrame, useNeraiuchiAuth } from "@/components/neraiuchi/NeraiuchiCommon";
import styles from "@/components/neraiuchi/neraiuchi.module.css";

export default function NeraiuchiList() {
  const { ready, uid } = useNeraiuchiAuth();
  const [items, setItems] = useState<NeraiuchiListedEvent[]>([]);
  const [latestEnded, setLatestEnded] = useState<NeraiuchiListedEvent | null>(null);
  const [clock, setClock] = useState<{ serverNow: number; receivedAt: number } | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [serverEnabled, setServerEnabled] = useState(false);
  const load = useCallback(async (position?: string) => {
    if (!uid) return false;
    setLoading(true); setError("");
    try {
      const data = await callNeraiuchi("listNeraiuchiEvents", position ? { cursor: position } : {});
      setItems((current) => position ? [...current, ...data.items] : data.items);
      if (!position) setLatestEnded(data.latestEnded);
      setCursor(data.nextCursor); setServerEnabled(data.enabled);
      setClock({ serverNow: data.serverNow, receivedAt: Date.now() });
      return true;
    } catch (error) { setError(errorMessage(error)); return false; }
    finally { setLoading(false); }
  }, [uid]);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  useEffect(() => {
    if (!clock) return;
    const boundary = nextNeraiuchiBoundary(items, clock.serverNow);
    if (boundary === null) return;
    const timer = window.setTimeout(() => void load(),
      Math.min(2147483647, Math.max(0, boundary - clock.serverNow - (Date.now() - clock.receivedAt)) + 100));
    return () => window.clearTimeout(timer);
  }, [items, clock, load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [load]);

  const joined = (entry: NeraiuchiEntry) => {
    const update = (event: NeraiuchiListedEvent) => event.id === entry.eventId
      ? { ...event, entry, resultsReleased: event.resultsReleased || entry.resultsReleased,
        availability: entry.resultsReleased ? "closed" as const : event.availability } : event;
    setItems((current) => current.map(update));
    setLatestEnded((current) => current ? update(current) : null);
    if (entry.resultsReleased) void load();
  };
  const card = (event: NeraiuchiListedEvent) => <section key={event.id} className={styles.card}>
    <span className={styles.status}>{availabilityLabels[event.availability]}</span>
    <MenuImageCard item={{ label: event.title, href: `/neraiuchi/${event.id}`, image: "neraiuchi", description: event.description }} />
    <p>受付：{formatJstDateTime(new Date(event.startsAt))}〜{formatJstDateTime(new Date(event.endsAt))}</p>
    <NeraiuchiParticipationButton event={event} loading={loading || Boolean(error)} onJoined={joined} onRefresh={() => load()} />
    <Link href={`/neraiuchi/${event.id}`}>{event.resultsReleased ? "参加者一覧・結果・当選品の受け取りを確認" : "企画の詳細を確認"}</Link>
  </section>;

  return <NeraiuchiFrame title="ゆめつきの狙い撃ち">
    {!ready ? <LoadingState /> : !uid ? <LoginNotice /> : <>
      {error && <ErrorNotice error={error} retry={() => void load()} />}
      {loading && <LoadingState />}
      {!loading && !error && (!neraiuchiEnabled || !serverEnabled)
        ? <p>狙い撃ちは現在公開準備中、または新規参加を停止しています。保存済みの参加履歴は確認できます。</p>
        : !loading && !error && items.length === 0
          ? <p>現在開催中の企画はありません。</p> : null}
      {neraiuchiEnabled && serverEnabled && items.map(card)}
      {cursor && <button type="button" disabled={loading} onClick={() => void load(cursor)}>次の20件</button>}
      {latestEnded && <>
        <h2>直近に終了した企画</h2>
        {card(latestEnded)}
      </>}
    </>}
  </NeraiuchiFrame>;
}
