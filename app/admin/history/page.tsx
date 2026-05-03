"use client";

import { useEffect, useState } from "react";
import { db } from "../../../firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  updateDoc,
  doc
} from "firebase/firestore";

export default function ShippingHistoryPage() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    const q = query(
      collection(db, "shippingHistory"),
      orderBy("requestedAt", "desc")
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

  const markAsShipped = async (id) => {
    const ref = doc(db, "shippingHistory", id);

    await updateDoc(ref, {
      shipped: true,
      shippedAt: new Date(),
    });

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
                alt={item.name}
                style={{
                  width: "80px",
                  height: "80px",
                  objectFit: "contain",
                }}
              />
            )}

            <div style={{ flex: 1 }}>
              {/* ★ ユーザー名と X アカウントを表示 */}
              <p><strong>ユーザー名：</strong> {item.userName || "未登録"}</p>

              <p>
                <strong>X：</strong>{" "}
                {item.userX ? (
                  <a
                    href={`https://x.com/${item.userX.replace("@", "")}`}
                    target="_blank"
                    style={{ color: "blue" }}
                  >
                    {item.userX}
                  </a>
                ) : (
                  "未登録"
                )}
              </p>

              <p><strong>ユーザーID：</strong> {item.uid}</p>
              <p><strong>発送物：</strong> {item.name}</p>
              <p><strong>ポイント：</strong> {item.cost} pt</p>

              <p>
                <strong>依頼日時：</strong>{" "}
                {item.requestedAt?.toDate
                  ? item.requestedAt.toDate().toLocaleString()
                  : "不明"}
              </p>

              <p>
                <strong>発送状態：</strong>{" "}
                <span style={{ color: item.shipped ? "green" : "orange" }}>
                  {item.shipped ? "発送済み" : "準備中"}
                </span>
              </p>

              {item.shippedAt && (
                <p>
                  <strong>発送日時：</strong>{" "}
                  {item.shippedAt?.toDate
                    ? item.shippedAt.toDate().toLocaleString()
                    : "不明"}
                </p>
              )}
            </div>

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
