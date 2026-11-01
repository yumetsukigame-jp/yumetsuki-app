"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { callNeraiuchi, neraiuchiEnabled } from "@/app/lib/neraiuchi";
import type { NeraiuchiHomeStatus } from "@/app/lib/neraiuchi";
import { formatJstDateTime } from "@/app/lib/dateTime";
import { errorMessage, useNeraiuchiAuth } from "./NeraiuchiCommon";
import styles from "@/app/home.module.css";

export default function NeraiuchiHomeAnnouncement({ onEnded }: {
  onEnded?: (event: NeraiuchiHomeStatus["latestEnded"]) => void;
}) {
  const { ready, uid } = useNeraiuchiAuth();
  const [event, setEvent] = useState<NeraiuchiHomeStatus["event"]>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!ready || !uid || !neraiuchiEnabled) return;
    let active = true;
    let pending = false;
    let transitionTimer: number | undefined;
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const data = await callNeraiuchi("getNeraiuchiHomeStatus", {});
        if (!active) return;
        setEvent(data.event); setError("");
        onEnded?.(data.latestEnded ?? null);
        window.clearTimeout(transitionTimer);
        if (data.refreshAt !== null) transitionTimer = window.setTimeout(() => {
          setEvent(null);
          void load();
        }, Math.min(2147483647, Math.max(0, data.refreshAt - data.serverNow) + 100));
      } catch (error) {
        if (active) { setEvent(null); setError(errorMessage(error)); }
      } finally { pending = false; }
    };
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60000);
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.clearTimeout(transitionTimer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [ready, uid, retry, onEnded]);
  if (!neraiuchiEnabled) return null;
  return <>
    {error && <div role="alert" className={styles.error}>
      ゆめつきの狙い撃ち企画の開催状況が確認できませんでした。
      <button type="button" onClick={() => setRetry((current) => current + 1)}>開催状況を再取得</button>
    </div>}
    {event && <aside className={styles.neraiuchiAnnouncement} aria-label="狙い撃ち開催のお知らせ">
      <Link href="/neraiuchi">
        <strong>ゆめつきの狙い撃ち開催中</strong>
        <span>開始：{formatJstDateTime(new Date(event.startsAt))}（日本時間）</span>
        <span>{event.title} ― 今回の企画を見る →</span>
      </Link>
    </aside>}
  </>;
}
