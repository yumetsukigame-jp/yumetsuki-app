import Link from "next/link";

export default function OsusowakeAnniversaryPage() {
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>
      <Link href="/archive" style={{ color: "#2563eb", fontWeight: "bold" }}>
        ← 書庫へ戻る
      </Link>
      <h1 style={{ margin: "20px 0 8px", textAlign: "center" }}>
        ゆめつきのお裾分け100回記念動画
      </h1>
      <p style={{ margin: "0 0 20px", textAlign: "center", color: "#555" }}>
        これまでのお裾分け企画を記念した動画です。
      </p>

      <video
        controls
        playsInline
        preload="metadata"
        style={{
          display: "block",
          width: "100%",
          borderRadius: 12,
          background: "#111827",
        }}
      >
        <source
          src="/archive/osusowake/yumetsuki100Anniv.mp4"
          type="video/mp4"
        />
        このブラウザでは動画を再生できません。
      </video>

      <p style={{ marginTop: 16, textAlign: "center" }}>
        <a
          href="/archive/osusowake/yumetsuki100Anniv.mp4"
          style={{ color: "#2563eb", fontWeight: "bold" }}
        >
          動画を開く
        </a>
      </p>
    </div>
  );
}
