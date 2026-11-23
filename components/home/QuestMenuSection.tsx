"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebase";
import { questCall } from "@/app/lib/quest";
import type { HomeMenuSection } from "@/app/lib/homeMenu";
import type { QuestMenuAccess } from "@/functions/src/quest/menu";
import FeatureSection from "./FeatureSection";
import styles from "./homeMenu.module.css";

export default function QuestMenuSection({ section }: { section: HomeMenuSection }) {
  const [access, setAccess] = useState<QuestMenuAccess | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true, generation = 0;
    const unsubscribe = onAuthStateChanged(auth, () => {
      const ticket = ++generation;
      setAccess(null); setFailed(false);
      questCall<QuestMenuAccess>("getQuestMenuAccess", {}).then(value => {
        if (active && ticket === generation) setAccess(value);
      }).catch(() => {
        if (active && ticket === generation) setFailed(true);
      });
    });
    return () => { active = false; unsubscribe(); };
  }, [retry]);
  const reason = failed ? "公開範囲を確認できないため、リンクを無効にしています。"
    : !access ? "公開範囲を確認しています…"
    : access.mode === "subscriber" ? "サブスク限定で公開しています。対象の方はログイン状態をご確認ください。"
    : "現在は管理者向けに準備中です。公開までお待ちください。";
  return <>
    <FeatureSection section={section} disabled={!access?.allowed} disabledReason={reason} />
    {failed && <button type="button" className={styles.retry} onClick={() => setRetry(value => value + 1)}>クエストの公開範囲を再確認</button>}
  </>;
}
