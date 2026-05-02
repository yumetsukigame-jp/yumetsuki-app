"use client";

import { useEffect, useState } from "react";
import { db, auth } from "../../firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function RewardPage() {
  const [rewards, setRewards] = useState<any[]>([]);
  const [points, setPoints] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      const uid = user.uid;

      // ユーザーポイント取得
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      setPoints(userSnap.exists() ? userSnap.data().points : 0);

      // 発送物一覧取得
      const rewardRef = collection(db, "rewards");
      const rewardSnap = await getDocs(rewardRef);

      const list = rewardSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setRewards(list);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleSelect = async (reward: any) => {
    if (points === null) return;

    // ポイント不足
    if (points < reward.cost) {
      alert("ポイントが足りません！");
      return;
    }

    // 在庫不足
    if (reward.stock <= 0) {
      alert("在庫がありません！");
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    const uid = user.uid;

    // 発送物選択を保存
    await setDoc(doc(db, "selectedRewards", uid), {
      rewardId: reward.id,
      name: reward.name,
      cost: reward.cost,
      timestamp: new Date(),
      shipped: false,
    });

    // 在庫を 1 減らす
    await updateDoc(doc(db, "rewards", reward.id), {
      stock: reward.stock - 1,
    });

    alert(`${reward.name} を選択しました！`);
  };

  if (loading) return <p style={{ padding: 20 }}>読み込み中…</p>;

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>発送物を選ぶ</h1>

      <p style={{ marginBottom: "20px" }}>
        現在のポイント： <strong>{points} pt</strong>
      </p>

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

            <button
              onClick={() => handleSelect(reward)}
              disabled={reward.stock <= 0 || points < reward.cost}
              style={{
                padding: "10px 16px",
                background:
                  reward.stock <= 0 || points < reward.cost
                    ? "#aaa"
                    : "#4f46e5",
                color: "white",
                borderRadius: "8px",
                border: "none",
                cursor:
                  reward.stock <= 0 || points < reward.cost
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {reward.stock <= 0
                ? "在庫なし"
                : points < reward.cost
                ? "ポイント不足"
                : "選択する"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
