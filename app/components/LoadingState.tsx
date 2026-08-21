"use client";

import { useEffect, useState } from "react";

type LoadingStateProps = {
  message?: string;
  className?: string;
};

export default function LoadingState({
  message = "読み込み中…",
  className,
}: LoadingStateProps) {
  const [showReload, setShowReload] = useState(false);
  const [reloadUrl, setReloadUrl] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("__reload", String(Date.now()));
      setReloadUrl(url.toString());
      setShowReload(true);
    }, 10000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className={className} style={{ padding: 20, textAlign: "center" }}>
      <p>{message}</p>
      {showReload && reloadUrl && (
        <a
          href={reloadUrl}
          style={{
            display: "inline-block",
            marginTop: 12,
            padding: "8px 16px",
            border: "1px solid #2563eb",
            borderRadius: 6,
            background: "#2563eb",
            color: "white",
            cursor: "pointer",
            textDecoration: "none",
          }}
        >
          再読み込み
        </a>
      )}
    </div>
  );
}