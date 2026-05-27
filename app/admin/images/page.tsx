"use client";

import { useEffect, useState } from "react";
import { db, storage } from "@/firebase";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import Link from "next/link";

export default function ImageListPage() {
  const [images, setImages] = useState<any[]>([]);
  const [folder, setFolder] = useState("gacha");
  const [loading, setLoading] = useState(true);

  const folders = [
    "gacha",
    "banners",
    "icons",
    "questicon",
    "character-select",
    "rewards",
    "memories",
    "misc",
  ];

  const load = async () => {
    setLoading(true);

    const snap = await getDocs(collection(db, "imageMeta"));
    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    setImages(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (item: any) => {
    if (!confirm("本当に削除しますか？")) return;

    // Storage 削除
    await deleteObject(ref(storage, item.path));

    // Firestore 削除
    await deleteDoc(doc(db, "imageMeta", item.id));

    alert("削除しました");
    load();
  };

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>🖼 画像一覧（フル機能版）</h1>

      {/* フォルダ選択 */}
      <div style={{ marginBottom: 20 }}>
        <label>フォルダ：</label>
        <select
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          style={{ padding: 8, marginLeft: 10 }}
        >
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <Link
          href="/admin/images/upload"
          style={{
            marginLeft: 20,
            padding: "8px 16px",
            background: "#2563eb",
            color: "white",
            borderRadius: 6,
          }}
        >
          ＋ 新規アップロード
        </Link>
      </div>

      {loading && <p>読み込み中…</p>}

      {!loading && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 20,
          }}
        >
          {images
            .filter((img) => img.folder === folder)
            .map((img) => (
              <div
                key={img.id}
                style={{
                  background: "white",
                  padding: 12,
                  borderRadius: 8,
                  boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                }}
              >
                {/* サムネイル */}
                <img
                  src={img.url}
                  style={{
                    width: "100%",
                    borderRadius: 6,
                    marginBottom: 8,
                  }}
                />

                {/* メタ情報 */}
                <p style={{ fontSize: 12, margin: 0 }}>
                  <strong>filename:</strong> {img.filename}
                </p>
                <p style={{ fontSize: 12, margin: 0 }}>
                  <strong>prefix:</strong> {img.prefix || "(なし)"}
                </p>
                <p style={{ fontSize: 12, margin: 0 }}>
                  <strong>path:</strong> {img.path}
                </p>

                {/* 使用中のガチャ */}
                {img.usedBy?.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <p style={{ fontSize: 12, margin: 0, color: "#555" }}>
                      使用中：
                    </p>
                    <ul style={{ paddingLeft: 16, fontSize: 12 }}>
                      {img.usedBy.map((u: string) => (
                        <li key={u}>{u}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 差し替え */}
                <Link
                  href={`/admin/images/${img.id}`}
                  style={{
                    marginTop: 10,
                    display: "block",
                    width: "100%",
                    padding: "6px 0",
                    background: "#4f46e5",
                    color: "white",
                    borderRadius: 6,
                    textAlign: "center",
                    textDecoration: "none",
                  }}
                >
                  差し替え
                </Link>

                {/* 削除 */}
                <button
                  onClick={() => handleDelete(img)}
                  style={{
                    marginTop: 10,
                    width: "100%",
                    padding: "6px 0",
                    background: "#ef4444",
                    color: "white",
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  削除
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
