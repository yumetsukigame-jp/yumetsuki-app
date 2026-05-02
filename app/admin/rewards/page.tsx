"use client";

import { useEffect, useState } from "react";
import { db } from "../../../firebase";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import Link from "next/link";

export default function AdminRewardsPage() {
  const [rewards, setRewards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRewards = async () => {
    const rewardRef = collection(db, "rewards");
    const rewardSnap = await getDocs(rewardRef);

    const list = rewardSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    setRewards(list);
    setLoading(false);
  };

  useEffect(() => {
    fetchRewards();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("本当に削除しますか？")) return;

    await deleteDoc(doc(db, "rewards", id));
    alert("削除しました");
    fetchRewards();
  };

  if (loading) return <p style={{ padding: 20 }}>読み込み中…</p>;

  return (
    <div style={{ padding: "20px", maxWidth: "700px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>
        発送物一覧（管理者）
      </h1>

      <Link
        href="/admin/rewards/add"
        style={{
          display: "inline-block",
          marginBottom: "20px",
          padding: "10px 16px",
          background: "#4f46e5",
          color: "white",
          borderRadius: "8px",
          textDecoration: "none",
        }}
      >
        ＋ 発送物を追加
      </Link>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {rewards.map((reward) => (
          <div
            key={reward.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: "8px",
              padding: "16px",
              display: "flex",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <img
              src={reward.image}
              alt={reward.name}
              style={{ width: "80px", height: "80px", objectFit: "contain" }}
            />

            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: "20px" }}>{reward.name}</h2>
              <p>{reward.cost} pt</p>
              <p>在庫：{reward.stock} 個</p>
            </div>

            <Link
              href={`/admin/rewards/edit/${reward.id}`}
              style={{
                padding: "8px 12px",
                background: "#10b981",
                color: "white",
                borderRadius: "6px",
                textDecoration: "none",
              }}
            >
              編集
            </Link>

            <button
              onClick={() => handleDelete(reward.id)}
              style={{
                padding: "8px 12px",
                background: "#ef4444",
                color: "white",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
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
