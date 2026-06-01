"use client";

import { useEffect, useState } from "react";
import { db } from "../../../../firebase";
import { collection, getDocs } from "firebase/firestore";

export default function ShippingStatsPage() {
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    const snap = await getDocs(collection(db, "shippingHistory"));

    const countMap: any = {};

    snap.docs.forEach((d) => {
      const data = d.data();

      // ★ ガチャ対応：複数のフィールド名をチェック
      const name =
        data.rewardName || // 通常の発送
        data.name ||        // ガチャの可能性
        data.frameName ||   // ガチャの別名
        "不明なアイテム";

      if (!countMap[name]) {
        countMap[name] = 0;
      }
      countMap[name] += 1;
    });

    setStats(countMap);
    setLoading(false);
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) return <p style={{ padding: 20 }}>読み込み中…</p>;

  const entries = Object.entries(stats);

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>
        発送物ごとの発送数集計
      </h1>

      {entries.length === 0 && <p>まだ発送履歴がありません。</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {entries.map(([name, count]) => (
          <div
            key={name}
            style={{
              border: "1px solid #ddd",
              borderRadius: "8px",
              padding: "16px",
            }}
          >
            <p><strong>{name}</strong></p>
            <p>発送数：{count} 個</p>
          </div>
        ))}
      </div>
    </div>
  );
}
