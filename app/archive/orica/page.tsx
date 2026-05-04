"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import OricaCard from "../../../components/OricaCard";
import OricaModal from "../../../components/OricaModal";

export default function OricaPage() {
  const [images, setImages] = useState<string[]>([]);
  const [owned, setOwned] = useState<Record<string, boolean>>({});
  const [uid, setUid] = useState<string | null>(null);
  const [modalImg, setModalImg] = useState<string | null>(null);

  // 画像一覧取得
  useEffect(() => {
    fetch("/api/orica-images")
      .then((res) => res.json())
      .then((data) => setImages(data));
  }, []);

  // ログインユーザー取得 & 所持状況読み込み
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      setUid(user.uid);

      const ownedData: Record<string, boolean> = {};

      for (const img of images) {
        const id =
          img.split("/").pop()?.replace(/\.(png|jpg|jpeg|webp)$/i, "") || "";
        const ref = doc(db, "users", user.uid, "orica", id);
        const snap = await getDoc(ref);
        ownedData[id] = snap.exists() ? snap.data().owned : false;
      }

      setOwned(ownedData);
    });

    return () => unsub();
  }, [images]);

  // 所持切り替え
  const toggleOwned = async (img: string) => {
    if (!uid) return;

    const id =
      img.split("/").pop()?.replace(/\.(png|jpg|jpeg|webp)$/i, "") || "";
    const newState = !owned[id];

    setOwned((prev) => ({ ...prev, [id]: newState }));

    await setDoc(doc(db, "users", uid, "orica", id), {
      owned: newState,
    });
  };

  // グループ分類
  const groups = {
    orica: images.filter((img) => img.includes("/orica_")),
    sp: images.filter((img) => img.includes("/sp_")),
    honpo: images.filter((img) => img.includes("/honpo_")),
  };

  return (
    <div style={{ padding: "20px", maxWidth: "480px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>オリカ管理</h1>

      {Object.entries(groups).map(([groupName, groupImages]) => (
        <div key={groupName} style={{ marginBottom: "40px" }}>
          <h2 style={{ marginBottom: "10px" }}>
            {groupName === "orica" && "通常企画"}
            {groupName === "sp" && "特別企画"}
            {groupName === "honpo" && "ゆめつき本舗"}
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
            {groupImages.map((img) => {
              const id =
                img.split("/").pop()?.replace(/\.(png|jpg|jpeg|webp)$/i, "") ||
                "";
              const isOwned = owned[id];

              return (
                <OricaCard
                  key={img}
                  img={img}
                  owned={isOwned}
                  onToggle={() => toggleOwned(img)}
                  onClick={() => setModalImg(img)}
                />
              );
            })}
          </div>
        </div>
      ))}

      <OricaModal img={modalImg} onClose={() => setModalImg(null)} />

      {/* ▼ 書庫に戻るボタン（追加部分） */}
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
      {/* ▲ ここまで追加 */}
    </div>
  );
}
