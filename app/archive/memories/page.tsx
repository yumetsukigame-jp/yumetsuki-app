"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { collection, getDocs } from "firebase/firestore";
import MemoryCard from "../../components/MemoryCard";
import OricaModal from "../../components/OricaModal";

export default function MemoriesPage() {
  const [images, setImages] = useState<any[]>([]);
  const [modalImg, setModalImg] = useState<string | null>(null);

  // Firestore から memories フォルダの画像を取得
  useEffect(() => {
    const load = async () => {
      const snap = await getDocs(collection(db, "imageMeta"));
      const list = snap.docs
        .map((d) => d.data())
        .filter((d) => d.folder === "memories"); // ← memories のみ

      setImages(list);
    };

    load();
  }, []);

  // グループ分類（prefix で判定）
  const groups = {
    week: images.filter((img) => img.prefix?.startsWith("week_")),
    oripa: images.filter((img) => img.prefix?.startsWith("oripa_")),
    sp: images.filter((img) => img.prefix?.startsWith("sp_")),
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
                key={img.url}
                img={img.url} // ← Firestore の URL を使う
                onClick={() => setModalImg(img.url)}
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
    </div>
  );
}
