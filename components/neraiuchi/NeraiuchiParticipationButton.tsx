"use client";

import { useRef, useState } from "react";
import { callNeraiuchi } from "@/app/lib/neraiuchi";
import type { NeraiuchiEntry, NeraiuchiListedEvent } from "@/app/lib/neraiuchi";
import { participationConfirmation, participationDisplay } from "@/app/lib/neraiuchiDisplay";
import { ErrorNotice, errorMessage } from "./NeraiuchiCommon";
import styles from "./neraiuchi.module.css";

export default function NeraiuchiParticipationButton({ event, loading, onJoined, onRefresh }: {
  event: NeraiuchiListedEvent;
  loading: boolean;
  onJoined: (entry: NeraiuchiEntry) => void;
  onRefresh: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const display = participationDisplay(event, event.entry);

  const join = async () => {
    if (pending.current || loading || recovery || !display.canParticipate) return;
    if (!confirm(participationConfirmation)) return;
    pending.current = true;
    setBusy(true); setError("");
    try {
      const data = await callNeraiuchi("joinNeraiuchi", { eventId: event.id });
      onJoined(data.entry);
    } catch (error) {
      setRecovery(true);
      setError(`${errorMessage(error)} 参加済みの可能性があります。「再取得」で参加状況を確認してください。`);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (pending.current || loading) return;
    pending.current = true;
    setBusy(true);
    try {
      if (await onRefresh()) { setRecovery(false); setError(""); }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return <div>
    <button type="button" className={styles.joinButton} onClick={() => void join()}
      disabled={loading || busy || recovery || !display.canParticipate} aria-busy={busy}>
      {busy ? "参加状況を確認中…" : display.buttonLabel}
    </button>
    <p className={styles.participationStatus} aria-live="polite">{display.resultLabel}</p>
    {error && !event.entry && <ErrorNotice error={error} retry={() => void refresh()} />}
  </div>;
}
