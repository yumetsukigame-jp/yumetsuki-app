"use client";

import { useEffect, useState } from "react";
import { db, auth } from "@/firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function RewardPage() {
  const [rewards, setRewards] = useState<any[]>([]);
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
      const list: any[] = [];
      querySnapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setRewards(list);
    };

    fetchRewards();
  }, []);

  /* --------------------------------------------------
     発送物を選択
  -------------------------------------------------- */
  const handleSelect = async (reward: any) => {
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

    // ユーザー情報取得
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    const userName = userSnap.data()?.name ?? "";
    const userX = userSnap.data()?.xAccount ?? "";

    const newPoints = points - reward.cost;

    /* --------------------------------------------------
       ① ユーザーポイントを減らす
    -------------------------------------------------- */
    await updateDoc(doc(db, "users", uid), {
      points: newPoints,
    });

    /* --------------------------------------------------
       ② selectedRewards に保存（uid を必ず含める）
    -------------------------------------------------- */
    await setDoc(doc(db, "selectedRewards", uid), {
      uid,                     // ★ 必須（ShippingAdminPage が使う）
      rewardId: reward.id,
      name: reward.name,
      cost: reward.cost,
      image: reward.image ?? null,
      timestamp: new Date(),
      shipped: false,
    });

    /* --------------------------------------------------
       ③ 在庫を減らす
    -------------------------------------------------- */
    await updateDoc(doc(db, "rewards", reward.id), {
      stock: reward.stock - 1,
    });

    /* --------------------------------------------------
       ④ shippingHistory に履歴保存
    -------------------------------------------------- */
    await setDoc(doc(collection(db, "shippingHistory")), {
      uid,
      rewardId: reward.id,
      name: reward.name,
      cost: reward.cost,
      image: reward.image ?? null,
      requestedAt: new Date(),
      shipped: false,
      userName,
      userX,
    });

    /* --------------------------------------------------
       ⑤ ポイントを画面に反映
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

            <button onClick={() => handleSelect(reward)}>
              この商品を選ぶ
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
