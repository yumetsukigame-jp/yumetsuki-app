"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
} from "firebase/firestore";

export default function GachaListPage() {
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
      <h1>🎛 ガチャコード管理</h1>

      {codes.length === 0 && <p>ガチャコードがありません。</p>}

      {codes.map((c) => (
        <div
          key={c.id}
          style={{
            border: "1px solid #ccc",
            padding: 16,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <h2 style={{ marginBottom: 8 }}>
            コード：<span style={{ fontWeight: "bold" }}>{c.code}</span>
          </h2>

          <p>作成日：{c.createdAt?.toDate().toLocaleString()}</p>
          <p>期限：{c.expiresAt?.toDate().toLocaleString()}</p>

          <h3>枠情報</h3>
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
              <strong>{f.name}</strong>
              <div>確率：{f.probability}</div>
              <div>
                使用数：{f.usedCount} /{" "}
                {f.maxCount === null ? "∞" : f.maxCount}
              </div>
              <div>
                報酬：{f.min} ～ {f.max}
              </div>
            </div>
          ))}

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
            コピー
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
      ))}
    </div>
  );
}
