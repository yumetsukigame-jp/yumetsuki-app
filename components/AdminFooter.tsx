"use client";

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
      <a
        href="/admin"
        style={{
          color: "#2563eb",
          textDecoration: "none",
          fontSize: "16px",
        }}
      >
        管理者トップへ戻る
      </a>
    </div>
  );
}
