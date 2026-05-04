"use client";

import { useEffect, useState } from "react";
import MemoryCard from "../../components/MemoryCard";
import OricaModal from "../../components/OricaModal";

export default function MemoriesPage() {
  const [images, setImages] = useState<string[]>([]);
  const [modalImg, setModalImg] = useState<string | null>(null);

  // 画像一覧取得
  useEffect(() => {
    fetch("/api/memories-images")
      .then((res) => res.json())
      .then((data) => setImages(data));
  }, []);

  // グループ分類
  const groups = {
    week: images.filter((img) => img.includes("/week_")),
    oripa: images.filter((img) => img.includes("/oripa_")),
    sp: images.filter((img) => img.includes("/sp_")),
  };

  return (
    <div style={{ padding: "20px", maxWidth: "480px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>過去の企画</h1>

      {Object.entries(groups).map(([groupName, groupImages]) => (
        <div key={groupName} style={{ marginBottom: "40px" }}>
          <h2 style={{ marginBottom: "10px" }}>
            {groupName === "week" && "週間企画"}
            {groupName === "oripa" && "オリパ企画"}
            {groupName === "sp" && "過去実施企画"}
          </h2>

          {/* 本棚の棚板 */}
          <div
            style={{
              height: "6px",
              background: "#8B5A2B",
              marginBottom: "10px",
              borderRadius: "3px",
            }}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
            }}
          >
            {groupImages.map((img) => (
              <MemoryCard
                key={img}
                img={img}
                onClick={() => setModalImg(img)}
              />
            ))}
          </div>
        </div>
      ))}

      <OricaModal img={modalImg} onClose={() => setModalImg(null)} />

      {/* ▼ 書庫に戻るボタン */}
      <div style={{ marginTop: "40px", textAlign: "center" }}>
        <a
          href="/archive"
          style={{
            display: "inline-block",
            padding: "12px 20px",
            background: "#4f46e5",
            color: "white",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "16px",
            fontWeight: "bold",
          }}
        >
          書庫に戻る
        </a>
      </div>
      {/* ▲ ここまで */}
    </div>
  );
}
