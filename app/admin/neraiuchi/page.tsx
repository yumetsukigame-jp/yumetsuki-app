"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { callNeraiuchi } from "@/app/lib/neraiuchi";
import type { NeraiuchiAdminEvent } from "@/app/lib/neraiuchi";
import LoadingState from "@/app/components/LoadingState";
import { ErrorNotice, errorMessage, LoginNotice, useNeraiuchiAuth } from "@/components/neraiuchi/NeraiuchiCommon";
import NeraiuchiDraftForm from "@/components/neraiuchi/NeraiuchiDraftForm";
import styles from "@/components/neraiuchi/neraiuchi.module.css";

export default function AdminNeraiuchiList() {
  const { ready, uid } = useNeraiuchiAuth();
  const [items, setItems] = useState<NeraiuchiAdminEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [archived, setArchived] = useState(false);
  const load = useCallback(async (position?: string) => {
    if (!uid) return;
    setLoading(true); setError("");
    try {
      const data = await callNeraiuchi("adminListNeraiuchiEvents", { archived, ...(position ? { cursor: position } : {}) });
      setItems((current) => position ? [...current, ...data.items] : data.items);
      setCursor(data.nextCursor); setAuthorized(true);
    } catch (error) { setError(errorMessage(error)); setAuthorized(false); }
    finally { setLoading(false); }
  }, [uid, archived]);
  const selectArchive = (selected: boolean) => {
    if (selected === archived || loading) return;
    setItems([]); setCursor(null); setArchived(selected);
  };
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  return <div className={styles.page}>
    <h1>狙い撃ち管理</h1><Link href="/admin">管理者トップへ</Link>
    {!ready ? <LoadingState /> : !uid ? <LoginNotice /> : <>
      {error && <ErrorNotice error={error} retry={() => void load()} />}
      {loading && <LoadingState />}
      {authorized && <>
        <div className={styles.actions}>
          <button type="button" aria-pressed={!archived} disabled={loading} onClick={() => selectArchive(false)}>開催中・下書き</button>
          <button type="button" aria-pressed={archived} disabled={loading} onClick={() => selectArchive(true)}>過去の企画（アーカイブ）</button>
        </div>
        <details className={styles.card}>
          <summary style={{ minHeight: 44, cursor: "pointer" }}>新しい企画を下書きで作成</summary>
          <NeraiuchiDraftForm />
        </details>
        <h2>{archived ? "過去の企画（アーカイブ）" : "企画一覧"}</h2>
        {!loading && !error && items.length === 0 && <p>企画はまだありません。</p>}
        {items.map((event) => <section className={styles.card} key={event.id}>
          <h2><Link href={`/admin/neraiuchi/${event.id}`}>{event.title}</Link></h2>
          <p>状態：{event.state}／参加：{event.acceptedCount}件／上限：{event.maxEntries}件</p>
          <Link href={`/admin/neraiuchi/${event.id}`}>設定・公開プレビュー・参加結果</Link>
        </section>)}
        {cursor && <button type="button" disabled={loading} onClick={() => void load(cursor)}>次の20件</button>}
      </>}
    </>}
  </div>;
}
