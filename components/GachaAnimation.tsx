"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function GachaAnimation({ outcome, onComplete }: {
  outcome: "win" | "lose";
  onComplete: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const finished = useRef(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    dialogRef.current?.focus();
    let cancelled = false;
    if (attempt > 0) video.load();
    video.muted = true;
    void video.play().catch(() => { if (!cancelled) setPlaybackError(true); });
    return () => {
      cancelled = true;
      video.pause();
    };
  }, [attempt]);

  return <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="抽選結果の演出" tabIndex={-1}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      (dialogRef.current?.querySelector("button") || dialogRef.current)?.focus();
    }}
    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex",
      justifyContent: "center", alignItems: "center", padding: 16, zIndex: 9999 }}>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      width: "100%", maxWidth: 496, maxHeight: "96dvh", overflowY: "auto", padding: 12,
      background: "white", borderRadius: 12 }}>
      <h2>抽選結果の演出</h2>
      <video ref={videoRef} src={`/gacha/${outcome}.mp4`} autoPlay muted playsInline preload="auto"
        width={496} height={864} aria-label="ガチャの抽選結果の演出"
        onEnded={finish} onError={() => setPlaybackError(true)} onStalled={() => setPlaybackError(true)}
        style={{ display: "block", width: "100%", height: "auto", maxHeight: "72dvh", objectFit: "contain" }}>
        お使いのブラウザーでは動画を再生できません。
      </video>
      {playbackError && <>
        <p role="alert">動画を最後まで再生できませんでした。再生をやり直してください。</p>
        <button type="button" onClick={() => { setPlaybackError(false); setAttempt(value => value + 1); }}>動画の再生をやり直す</button>
      </>}
    </div>
  </div>;
}
