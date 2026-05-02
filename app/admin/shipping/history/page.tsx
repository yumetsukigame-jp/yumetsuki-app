"use client";

import { useEffect, useState } from "react";
import { db } from "../../../../firebase";
import { collection, getDocs } from "firebase/firestore";

export default function ShippingHistoryPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    const snap = await getDocs(collection(db, "shippingHistory"));

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

  if (loading) return <p style={{ padding: 20 }}>読み込み中…</p>;

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>
        発送履歴
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

            <div>
              <p><strong>ユーザーID：</strong> {item.uid}</p>
              <p><strong>発送物：</strong> {item.rewardName}</p>
              <p><strong>ポイント：</strong> {item.cost} pt</p>
              <p><strong>発送日時：</strong> {item.shippedAt?.toDate().toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
