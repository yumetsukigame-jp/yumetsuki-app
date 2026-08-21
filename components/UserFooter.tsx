"use client";

import Link from "next/link";

export default function UserFooter() {
  return (
    <div
      style={{
        marginTop: "50px",
        paddingTop: "20px",
        borderTop: "1px solid #ddd",
        textAlign: "center",
      }}
    >
      <Link
        href="/"
        style={{
          color: "#2563eb",
          textDecoration: "none",
          fontSize: "16px",
        }}
      >
        トップページへ戻る
      </Link>
    </div>
  );
}
