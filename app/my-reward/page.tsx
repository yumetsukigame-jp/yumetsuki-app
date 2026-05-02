"use client";

import { useEffect, useState } from "react";
import { db, auth } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function MyRewardPage() {
  const [reward, setReward] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      const uid = user.uid;

      // ユーザーが選んだ発送物を取得
      const ref = doc(db, "selectedRewards", uid);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        setReward(snap.data());
      } else {
        setReward(null);
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) return <p style={{ padding: 20 }}>読み込み中…</p>;

  if (!reward) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <h2>まだ発送物を選んでいません。</h2>
        <a
          href="/reward"
          style={{
            marginTop: "20px",
            display: "inline-block",
            padding: "10px 16px",
            background: "#4f46e5",
            color: "white",
            borderRadius: "8px",
            textDecoration: "none",
          }}
        >
          発送物を選ぶ
        </a>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>
        選択した発送物
      </h1>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "16px",
        }}
      >
        {/* 画像表示 */}
        {reward.image && (
          <img
            src={reward.image}
            alt={reward.name}
            style={{
              width: "120px",
              height: "120px",
              objectFit: "contain",
              marginBottom: "16px",
            }}
          />
        )}

        <p>
          <strong>発送物：</strong> {reward.name}
        </p>
        <p>
          <strong>必要ポイント：</strong> {reward.cost} pt
        </p>
        <p>
          <strong>選択日時：</strong>{" "}
          {reward.timestamp?.toDate().toLocaleString()}
        </p>

        {reward.shipped ? (
          <p style={{ color: "green", marginTop: "10px" }}>
            <strong>発送済み：</strong>{" "}
            {reward.shippedAt?.toDate().toLocaleString()}
          </p>
        ) : (
          <p style={{ color: "red", marginTop: "10px" }}>
            <strong>発送状況：</strong> 未発送
          </p>
        )}
      </div>

      <a
        href="/"
        style={{
          marginTop: "30px",
          display: "inline-block",
          padding: "10px 16px",
          background: "#e5e7eb",
          color: "#111",
          borderRadius: "8px",
          textDecoration: "none",
        }}
      >
        トップへ戻る
      </a>
    </div>
  );
}
