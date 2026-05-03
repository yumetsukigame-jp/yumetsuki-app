"use client";

import Link from "next/link";

export default function RewardCompletePage() {
  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "500px",
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      <img
        src="/check.png"
        alt="完了"
        style={{
          width: "120px",
          height: "120px",
          margin: "0 auto 20px",
          objectFit: "contain",
        }}
      />

      <h1 style={{ fontSize: "24px", marginBottom: "16px" }}>
        発送依頼を受け付けました
      </h1>

      <p style={{ marginBottom: "24px", lineHeight: 1.6 }}>
        発送準備が整い次第、順次発送いたします。
        <br />
        発送状況は「発送履歴」から確認できます。
      </p>

      <Link
        href="/history"
        style={{
          display: "inline-block",
          padding: "12px 20px",
          background: "#4f46e5",
          color: "white",
          borderRadius: "8px",
          textDecoration: "none",
          fontSize: "16px",
        }}
      >
        発送履歴を見る
      </Link>

      <br />
      <Link
        href="/"
        style={{
          display: "inline-block",
          marginTop: "16px",
          color: "#4f46e5",
          textDecoration: "underline",
        }}
      >
        ホームに戻る
      </Link>
    </div>
  );
}
