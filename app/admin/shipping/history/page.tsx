"use client";

import { useEffect, useState } from "react";
import { db } from "../../../../firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  updateDoc,
  doc
} from "firebase/firestore";

export default function ShippingHistoryPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    // ★ shippedAt の降順（新しい順）
    const q = query(
      collection(db, "shippingHistory"),
      orderBy("shippedAt", "desc")
    );

    const snap = await getDocs(q);

    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    setHistory(list);
    setLoading(false);
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // 🔥 発送済みにする処理（履歴側で再確定する場合）
  const markAsShipped = async (id: string) => {
    const ref = doc(db, "shippingHistory", id);

    await updateDoc(ref, {
      shipped: true,
      shippedAt: new Date(),
    });

    // UI 更新
    setHistory((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, shipped: true, shippedAt: new Date() }
          : item
      )
    );
  };

  if (loading) return <p style={{ padding: 20 }}>読み込み中…</p>;

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>
        発送履歴（管理者）
      </h1>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {history.map((item) => (
          <div
            key={item.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: "8px",
              padding: "16px",
              display: "flex",
              gap: "16px",
              alignItems: "center",
            }}
          >
            {item.image && (
              <img
                src={item.image}
                alt={item.rewardName}
                style={{
                  width: "80px",
                  height: "80px",
                  objectFit: "contain",
                }}
              />
            )}

            <div style={{ flex: 1 }}>
              <p><strong>ニックネーム：</strong> {item.userNickname ?? "名無し"}</p>
              <p><strong>ユーザー名：</strong> {item.userName}</p>
              <p><strong>メール：</strong> {item.userEmail}</p>
              <p><strong>X：</strong> {item.userX ?? "不明"}</p>
              <p><strong>ユーザーID：</strong> {item.uid}</p>

              <p><strong>発送物：</strong> {item.rewardName}</p>
              <p><strong>ポイント：</strong> {item.cost} pt</p>

              <p>
                <strong>発送日時：</strong>{" "}
                {item.shippedAt?.toDate
                  ? item.shippedAt.toDate().toLocaleString()
                  : "不明"}
              </p>

              <p>
                <strong>発送状態：</strong>{" "}
                <span style={{ color: item.shipped ? "green" : "orange" }}>
                  {item.shipped ? "発送済み" : "準備中"}
                </span>
              </p>
            </div>

            {/* 🔥 発送済みボタン（必要なら残す） */}
            {!item.shipped && (
              <button
                onClick={() => markAsShipped(item.id)}
                style={{
                  padding: "10px 16px",
                  background: "#4f46e5",
                  color: "white",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  height: "40px",
                }}
              >
                発送済みにする
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
