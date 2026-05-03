"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  orderBy,
  query,
} from "firebase/firestore";

export default function CodesPage() {
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCodes = async () => {
    const q = query(collection(db, "validCodes"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    const list: any[] = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));

    setCodes(list);
    setLoading(false);
  };

  useEffect(() => {
    fetchCodes();
  }, []);

  // ★ コード削除処理
  const deleteCode = async (id: string) => {
    const ok = confirm(`コード「${id}」を削除しますか？`);
    if (!ok) return;

    await deleteDoc(doc(db, "validCodes", id));

    alert("削除しました");

    // 再読み込み
    fetchCodes();
  };

  if (loading) return <p style={{ padding: 20 }}>読み込み中…</p>;

  return (
    <div style={{ padding: "20px", maxWidth: "700px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "20px" }}>コード一覧</h1>

      {codes.length === 0 && <p>コードがありません。</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {codes.map((item) => (
          <div
            key={item.id}
            style={{
              border: "1px solid #ccc",
              borderRadius: "8px",
              padding: "16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {/* 左側：コード情報 */}
            <div>
              <p><strong>コード：</strong> {item.id}</p>
              <p><strong>ポイント：</strong> {item.points} pt</p>
              <p>
                <strong>タイプ：</strong>{" "}
                {item.type === "global"
                  ? "全員で1回だけ使える"
                  : item.type === "perUser"
                  ? "全員が1回ずつ使える"
                  : "不明"}
              </p>
              <p>
                <strong>作成日時：</strong>{" "}
                {item.createdAt?.toDate
                  ? item.createdAt.toDate().toLocaleString()
                  : "不明"}
              </p>

              <a
                href={`/admin/codes/${item.id}`}
                style={{ color: "#2563eb", textDecoration: "none" }}
              >
                詳細を見る →
              </a>
            </div>

            {/* 右側：削除ボタン */}
            <button
              onClick={() => deleteCode(item.id)}
              style={{
                padding: "10px 16px",
                background: "#dc2626",
                color: "white",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                height: "40px",
              }}
            >
              削除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
