"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
} from "firebase/firestore";

export default function AdminGachaListPage() {
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCodes = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, "gachaCodes"));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setCodes(list);
    setLoading(false);
  };

  const deleteCode = async (id: string) => {
    if (!confirm("本当に削除しますか？")) return;
    await deleteDoc(doc(db, "gachaCodes", id));
    await loadCodes();
  };

  useEffect(() => {
    loadCodes();
  }, []);

  if (loading) return <div style={{ padding: 24 }}>読み込み中…</div>;

  return (
    <div style={{ padding: 24 }}>
      <h1>🎛 ガチャ管理一覧</h1>

      {codes.length === 0 && <p>ガチャがありません。</p>}

      {codes.map((c) => (
        <div
          key={c.id}
          style={{
            border: "1px solid #ccc",
            padding: 16,
            borderRadius: 8,
            marginBottom: 16,
            background: "white",
          }}
        >
          {/* サムネイル */}
          {c.thumbnail && (
            <div style={{ marginBottom: 12 }}>
              <img
                src={`/gacha/${c.thumbnail}`}
                style={{
                  width: 120,
                  height: 120,
                  objectFit: "cover",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                }}
              />
            </div>
          )}

          {/* タイトル */}
          <h2 style={{ marginBottom: 8 }}>
            {c.title}
          </h2>

          {/* コード */}
          <p style={{ margin: "4px 0" }}>
            コード：<strong>{c.code}</strong>
          </p>

          {/* 公開 / 限定 */}
          <p style={{ margin: "4px 0" }}>
            種類：{c.public ? "🌐 公開" : "🔒 限定"}
          </p>

          {/* 抽選方式 */}
          <p style={{ margin: "4px 0" }}>
            抽選方式：
            {c.mode === "count" ? "枠数方式" : "確率方式"}
          </p>

          {/* リセット方式 */}
          <p style={{ margin: "4px 0" }}>
            リセット：
            {c.resetType === "daily" ? "デイリー（毎日6時）" : "なし"}
          </p>

          {/* 期限 */}
          <p style={{ margin: "4px 0" }}>
            期限：
            {c.expiresAt?.toDate
              ? c.expiresAt.toDate().toLocaleString()
              : "なし"}
          </p>

          {/* 枠情報 */}
          <h3 style={{ marginTop: 12 }}>枠情報</h3>

          {c.frames.map((f: any, i: number) => (
            <div
              key={i}
              style={{
                padding: 8,
                border: "1px solid #eee",
                borderRadius: 6,
                marginBottom: 6,
              }}
            >
              <strong>{f.label}</strong>

              {c.mode === "count" && (
                <div>
                  使用数：{f.usedCount} / {f.maxCount ?? "∞"}
                </div>
              )}

              {c.mode === "probability" && (
                <div>確率：{(f.probability * 100).toFixed(1)}%</div>
              )}

              <div>
                報酬：{f.rewardMin} ～ {f.rewardMax}
              </div>
            </div>
          ))}

          {/* ボタン */}
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => navigator.clipboard.writeText(c.code)}
              style={{
                marginRight: 10,
                padding: "6px 12px",
                background: "#2563eb",
                color: "white",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
              }}
            >
              コードをコピー
            </button>

            <button
              onClick={() => deleteCode(c.id)}
              style={{
                padding: "6px 12px",
                background: "#dc2626",
                color: "white",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
              }}
            >
              削除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
