"use client";

import { useEffect, useState } from "react";
import { db, auth } from "@/firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";

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
    if (points === null) return;

    if (points < reward.cost) {
      alert("ポイントが足りません！");
      return;
    }

    if (reward.stock <= 0) {
      alert("在庫がありません！");
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    const uid = user.uid;

    const newPoints = points - reward.cost;

    /* --------------------------------------------------
       ① 発送依頼ごとに一意なIDで保存
    -------------------------------------------------- */
    const pendingRef = doc(collection(db, "shippingPending"));
    const requestId = pendingRef.id;
    const legacyRef = doc(db, "selectedRewards", requestId);

    const pendingData = {
      requestId,
      uid,
      rewardId: reward.id,
      name: reward.name,
      cost: reward.cost,
      image: reward.image ?? null,
      requestedAt: serverTimestamp(),
      status: "pending",
      shipped: false,
      timestamp: new Date(),
    };

    const batch = writeBatch(db);
    batch.update(doc(db, "users", uid), {
      points: newPoints,
    });
    batch.update(doc(db, "rewards", reward.id), {
      stock: reward.stock - 1,
    });
    batch.set(pendingRef, pendingData);
    batch.set(legacyRef, pendingData);
    await batch.commit();

    /* --------------------------------------------------
       ② ポイントを画面に反映
    -------------------------------------------------- */
    setPoints(newPoints);

    router.push("/reward/complete");
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
