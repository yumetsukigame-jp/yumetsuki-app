"use client";

import { useEffect, useState } from "react";
import { db, auth } from "../../firebase";  // ← ★ これが正しい
import {
  collection,
  query,
  where,
  orderBy,
  getDocs
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

type FirestoreDateLike =
  | { toDate?: () => Date; _seconds?: number; seconds?: number }
  | Date
  | null
  | undefined;

type HistoryItem = {
  id: string;
  image?: string | null;
  name?: string;
  cost?: number;
  requestedAt?: FirestoreDateLike;
  status?: "pending" | "done";
  shipped?: boolean;
  shippedAt?: FirestoreDateLike;
  [key: string]: unknown;
};

const toDisplayDate = (value?: FirestoreDateLike) => {
  if (!value) return "不明";
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toLocaleString();
  }
  return "不明";
};

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const getStatusLabel = (item: HistoryItem) => {
    if (item.status) {
      return item.status === "done" ? "発送済み" : "準備中";
    }
    return item.shipped ? "発送済み" : "準備中";
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      const q = query(
        collection(db, "shippingHistory"),
        where("uid", "==", user.uid),
        orderBy("shippedAt", "desc")
      );

      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Record<string, unknown>),
      } as HistoryItem));

      setHistory(list);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) return <p style={{ padding: 20 }}>読み込み中…</p>;

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>発送履歴</h1>

      {history.length === 0 && <p>まだ発送履歴がありません。</p>}

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
              <h2 style={{ fontSize: "18px" }}>{item.name}</h2>
              <p>消費ポイント：{item.cost} pt</p>

              <p>
                依頼日時：{" "}
                {toDisplayDate(item.requestedAt)}
              </p>

              <p>
                状態：{" "}
                <strong
                  style={{
                    color:
                      item.status === "done" || item.shipped ? "green" : "orange",
                  }}
                >
                  {getStatusLabel(item)}
                </strong>
              </p>

              {item.shippedAt && (
                <p>
                  発送日時：{" "}
                  {toDisplayDate(item.shippedAt)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
