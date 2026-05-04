export default function ArchivePage() {
  return (
    <div style={{ padding: "20px", maxWidth: "480px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>書庫</h1>

      <p style={{ marginBottom: "20px", color: "#555" }}>
        ここでは、過去の企画の振り返りやオリカの管理ができます。
      </p>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <a
          href="/archive/orica"
          style={{
            padding: "12px",
            background: "#4f46e5",
            color: "white",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "18px",
            fontWeight: "bold",
          }}
        >
          オリカ管理
        </a>

        <a
          href="/archive/memories"
          style={{
            padding: "12px",
            background: "#4f46e5",
            color: "white",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "18px",
            fontWeight: "bold",
          }}
        >
          過去の企画
        </a>
      </div>
    </div>
  );
}
