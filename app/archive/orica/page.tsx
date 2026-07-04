"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, doc, getDoc, setDoc } from "firebase/firestore";
import OricaCard from "../../../components/OricaCard";
import OricaModal from "../../../components/OricaModal";

export default function OricaPage() {
  const [images, setImages] = useState<any[]>([]);
  const [owned, setOwned] = useState<Record<string, boolean>>({});
  const [uid, setUid] = useState<string | null>(null);
  const [modalImg, setModalImg] = useState<string | null>(null);

  // Firestore から画像メタ情報を取得（MemoriesPage と同じ構造）
  useEffect(() => {
    const load = async () => {
      const snap = await getDocs(collection(db, "imageMeta"));
      const list = snap.docs
        .map((d) => d.data())
        .filter((d) => d.folder === "orica"); // ← フォルダ名で絞る（MemoriesPage と同じ）

      setImages(list);
    };

    load();
  }, []);

  // ログインユーザー取得 & 所持状況読み込み
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      setUid(user.uid);

      const ownedData: Record<string, boolean> = {};

      for (const img of images) {
        // fileName から拡張子を除いて id を作る（MemoriesPage と同じ）
        const id = img.fileName.replace(/\.(png|jpg|jpeg|webp)$/i, "");

        const ref = doc(db, "users", user.uid, "orica", id);
        const snap = await getDoc(ref);
        ownedData[id] = snap.exists() ? snap.data().owned : false;
      }

      setOwned(ownedData);
    });

    return () => unsub();
  }, [images]);

  // 所持切り替え
  const toggleOwned = async (img: any) => {
    if (!uid) return;

    const id = img.fileName.replace(/\.(png|jpg|jpeg|webp)$/i, "");
    const newState = !owned[id];

    setOwned((prev) => ({ ...prev, [id]: newState }));

    await setDoc(doc(db, "users", uid, "orica", id), {
      owned: newState,
    });
  };

  // グループ分類（prefix 判定は MemoriesPage と同じ）
  const groups = {
    orica: images.filter((img) => img.prefix === "orica_"),
    sp: images.filter((img) => img.prefix === "sp_"),
    honpo: images.filter((img) => img.prefix === "honpo_"),
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
              const id = img.fileName.replace(/\.(png|jpg|jpeg|webp)$/i, "");
              const isOwned = owned[id];

              return (
                <OricaCard
                  key={img.url}
                  img={img.url}
                  owned={isOwned}
                  onToggle={() => toggleOwned(img)}
                  onClick={() => setModalImg(img.url)}
                />
              );
            })}
          </div>
        </div>
      ))}

      <OricaModal img={modalImg} onClose={() => setModalImg(null)} />

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
