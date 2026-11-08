"use client";

import { useCallback, useEffect, useRef } from "react";

export default function GachaAnimation({ outcome, onComplete }: {
  outcome: "win" | "lose";
  onComplete: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const finished = useRef(false);
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    let cancelled = false;
    // A failed request or stalled player must not hide an already committed draw.
    const timer = window.setTimeout(finish, 30000);
    video.muted = true;
    void video.play().catch(() => { if (!cancelled) finish(); });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      video.pause();
    };
  }, [finish]);

  return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: "100%" }}>
    <video ref={videoRef} src={`/gacha/${outcome}.mp4`} autoPlay muted playsInline preload="auto"
      width={496} height={864} aria-label="ガチャの抽選結果の演出"
      onEnded={finish} onError={finish}
      style={{ display: "block", width: "100%", maxWidth: 496, height: "auto", maxHeight: "72dvh", objectFit: "contain" }}>
      演出を再生できない場合は、スキップして結果をご確認ください。
    </video>
    <button type="button" autoFocus onClick={finish}>演出をスキップして当選品を見る</button>
  </div>;
}
