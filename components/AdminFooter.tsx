"use client";

import Link from "next/link";

export default function AdminFooter() {
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
        href="/admin"
        style={{
          color: "#2563eb",
          textDecoration: "none",
          fontSize: "16px",
        }}
      >
        管理者トップへ戻る
      </Link>
    </div>
  );
}
