"use client";

import { useEffect, useRef, useState } from "react";
import { db, auth } from "@/firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { redeemReward } from "@/app/lib/fulfillment";

type RewardItem = {
  id: string;
  name: string;
  cost: number;
  stock: number;
  image?: string | null;
};

export default function RewardPage() {
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [points, setPoints] = useState<number | null>(null);
  const router = useRouter();
  const selecting = useRef(false);
  const [busy, setBusy] = useState(false);

  /* --------------------------------------------------
     ユーザーのポイント取得
  -------------------------------------------------- */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        setPoints(userSnap.data().points);
      }
    });

    return () => unsubscribe();
  }, []);

  /* --------------------------------------------------
     商品一覧取得
  -------------------------------------------------- */
  useEffect(() => {
    const fetchRewards = async () => {
      const querySnapshot = await getDocs(collection(db, "rewards"));
      const list: RewardItem[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data() as Partial<RewardItem>;
        list.push({
          id: docSnap.id,
          name: data.name ?? "",
          cost: data.cost ?? 0,
          stock: data.stock ?? 0,
          image: data.image ?? null,
        });
      });
      setRewards(list);
    };

    fetchRewards();
  }, []);

  /* --------------------------------------------------
     発送物を選択
  -------------------------------------------------- */
  const handleSelect = async (reward: RewardItem) => {
    if (selecting.current) return;
    if (points === null) return;

    if (points < reward.cost) {
      alert("ポイントが足りません！");
      return;
    }

    if (reward.stock <= 0) {
      alert("在庫がありません！");
      return;
    }

    if (
      !confirm(`${reward.name}を発送します。確定してよろしいですか？`)
    ) {
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    selecting.current = true;
    setBusy(true);
    try {
      const key = `reward-request:${user.uid}:${reward.id}`;
      const requestId = localStorage.getItem(key) ?? crypto.randomUUID();
      localStorage.setItem(key, requestId);
      const response = await redeemReward({
        rewardId: reward.id, requestId, cost: reward.cost, participantUid: user.uid, confirmed: true,
      });
      localStorage.removeItem(key);
      if (auth.currentUser?.uid !== user.uid) return;
      setPoints(response.data.points);
      router.push("/reward/complete");
    } catch (error) {
      console.error("ポイント交換の発送依頼に失敗しました", error);
      alert(error instanceof Error ? error.message : "発送依頼を保存できませんでした。同じ操作を再試行してください。");
    } finally {
      selecting.current = false;
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>発送物を選ぶ</h1>

      <p>現在のポイント: {points ?? "読み込み中..."}</p>

      <div style={{ marginTop: "20px" }}>
        {rewards.map((reward) => (
          <div
            key={reward.id}
            style={{
              border: "1px solid #ccc",
              padding: "10px",
              marginBottom: "10px",
              borderRadius: "8px",
            }}
          >
            {/* 画像表示 */}
            {reward.image && (
              <img
                src={reward.image}
                alt={reward.name}
                style={{
                  width: "150px",
                  height: "150px",
                  objectFit: "contain",
                  marginBottom: "10px",
                }}
              />
            )}

            <h3>{reward.name}</h3>
            <p>必要ポイント: {reward.cost}</p>
            <p>在庫: {reward.stock}</p>

            {/* ★ 改善したボタン（①のデザイン） */}
            <button
              onClick={() => handleSelect(reward)}
              disabled={busy}
              style={{
                padding: "12px 20px",
                background: "#4f46e5",
                color: "white",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                fontSize: "16px",
                fontWeight: "bold",
                width: "100%",
                marginTop: "10px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
              }}
            >
              この商品を選ぶ
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
