"use client";

import { useEffect, useState } from "react";
import { db } from "../../../../firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  updateDoc,
  doc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";

export default function ShippingHistoryPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMap, setOpenMap] = useState<{ [id: string]: boolean }>({});
  const [sortKey, setSortKey] = useState("dateDesc");

  const fetchHistory = async () => {
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

  // 発送済みにする
  const markAsShipped = async (id: string) => {
    const ref = doc(db, "shippingHistory", id);

    await updateDoc(ref, {
      shipped: true,
      shippedAt: Timestamp.now(), // ← Firestore Timestamp に統一
    });

    setHistory((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, shipped: true, shippedAt: Timestamp.now() }
          : item
      )
    );
  };

  // 削除
  const deleteHistory = async (id: string) => {
    if (!confirm("本当に削除しますか？")) return;

    await deleteDoc(doc(db, "shippingHistory", id));

    setHistory((prev) => prev.filter((item) => item.id !== id));
  };

  // 開閉
  const toggleOpen = (id: string) => {
    setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Timestamp / Date 両対応の変換
  const toMillis = (value: any) => {
    if (!value) return 0;
    if (value.toDate) return value.toDate().getTime();
    return new Date(value).getTime();
  };

  // 並べ替え
  const sortedHistory = [...history].sort((a, b) => {
    const tA = toMillis(a.shippedAt);
    const tB = toMillis(b.shippedAt);

    switch (sortKey) {
      case "dateAsc":
        return tA - tB;
      case "dateDesc":
        return tB - tA;
      case "pointHigh":
        return (b.cost ?? 0) - (a.cost ?? 0);
      case "pointLow":
        return (a.cost ?? 0) - (b.cost ?? 0);
      case "nameAsc":
        return (a.userNickname ?? "").localeCompare(b.userNickname ?? "");
      case "nameDesc":
        return (b.userNickname ?? "").localeCompare(a.userNickname ?? "");
      default:
        return 0;
    }
  });

  const formatDate = (value: any) => {
    if (!value) return "日時不明";
    if (value.toDate) return value.toDate().toLocaleString();
    return new Date(value).toLocaleString();
  };

  if (loading) return <p style={{ padding: 20 }}>読み込み中…</p>;

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>
        発送履歴（管理者）
      </h1>

      {/* 並べ替え */}
      <div style={{ marginBottom: "20px" }}>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value)}
          style={{ padding: "8px", borderRadius: "6px" }}
        >
          <option value="dateDesc">発送日時（新しい順）</option>
          <option value="dateAsc">発送日時（古い順）</option>
          <option value="pointHigh">ポイント（高い順）</option>
          <option value="pointLow">ポイント（低い順）</option>
          <option value="nameAsc">ニックネーム（A→Z）</option>
          <option value="nameDesc">ニックネーム（Z→A）</option>
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {sortedHistory.map((item) => {
          const isOpen = openMap[item.id] ?? false;

          return (
            <div
              key={item.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: "8px",
                padding: "16px",
              }}
            >
              {/* ▼▼▼ ヘッダー（閉じている時の表示） ▼▼▼ */}
              <div
                onClick={() => toggleOpen(item.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {/* アイコン */}
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.rewardName}
                      style={{
                        width: "40px",
                        height: "40px",
                        objectFit: "contain",
                        borderRadius: "6px",
                      }}
                    />
                  )}

                  <div>
                    <strong>{item.rewardName}</strong>
                    <br />

                    <span style={{ fontSize: "13px", color: "#444" }}>
                      {item.userNickname ?? "名無し"}（{item.userX ?? "不明"}）
                    </span>
                    <br />

                    <span style={{ fontSize: "12px", color: "#666" }}>
                      {formatDate(item.shippedAt)}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: "20px" }}>{isOpen ? "▲" : "▼"}</div>
              </div>
              {/* ▲▲▲ ヘッダーここまで ▲▲▲ */}

              {/* ▼▼▼ 詳細（開閉） ▼▼▼ */}
              {isOpen && (
                <div style={{ marginTop: "12px" }}>
                  <p><strong>ユーザー名：</strong> {item.userName}</p>
                  <p><strong>メール：</strong> {item.userEmail}</p>
                  <p><strong>ユーザーID：</strong> {item.uid}</p>
                  <p><strong>ポイント：</strong> {item.cost} pt</p>

                  <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
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
                        }}
                      >
                        発送済みにする
                      </button>
                    )}

                    <button
                      onClick={() => deleteHistory(item.id)}
                      style={{
                        padding: "10px 16px",
                        background: "#dc2626",
                        color: "white",
                        borderRadius: "8px",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      削除
                    </button>
                  </div>
                </div>
              )}
              {/* ▲▲▲ 詳細ここまで ▲▲▲ */}
            </div>
          );
        })}
      </div>
    </div>
  );
}
