"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { db, auth } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";

type RewardRecord = {
  name?: string;
  cost?: number;
  image?: string | null;
  timestamp?: { toDate: () => Date } | Date | null;
  shipped?: boolean;
  shippedAt?: { toDate: () => Date } | Date | null;
  status?: "pending" | "done";
};

export default function MyRewardPage() {
  const [reward, setReward] = useState<RewardRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const formatTimestamp = (value: RewardRecord["timestamp"] | RewardRecord["shippedAt"]) => {
    if (!value) return "不明";
    if (value instanceof Date) return value.toLocaleString();
    if ("toDate" in value) return value.toDate().toLocaleString();
    return new Date(value).toLocaleString();
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      const uid = user.uid;

      // 現在の発送状態を priority order で確認
      const pendingRef = doc(db, "shippingPending", uid);
      const doneRef = doc(db, "shippingDone", uid);
      const legacyRef = doc(db, "selectedRewards", uid);

      const pendingSnap = await getDoc(pendingRef);
      const doneSnap = await getDoc(doneRef);
      const legacySnap = await getDoc(legacyRef);

      if (pendingSnap.exists()) {
        setReward({ ...pendingSnap.data(), status: "pending" });
      } else if (doneSnap.exists()) {
        setReward({ ...doneSnap.data(), status: "done" });
      } else if (legacySnap.exists()) {
        const legacyData = legacySnap.data();
        const status = legacyData.status ?? (legacyData.shipped ? "done" : "pending");
        setReward({ ...legacyData, status });
      } else {
        setReward(null);
      }

      setLoading(false);
    });

    return () => unsub();
  }, [router]);
  if (loading) return <p style={{ padding: 20 }}>読み込み中…</p>;

  if (!reward) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <h2>まだ発送物を選んでいません。</h2>
        <Link
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
        </Link>
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
          {formatTimestamp(reward.timestamp)}
        </p>

        {reward.shipped ? (
          <p style={{ color: "green", marginTop: "10px" }}>
            <strong>発送済み：</strong>{" "}
            {formatTimestamp(reward.shippedAt)}
          </p>
        ) : (
          <p style={{ color: "red", marginTop: "10px" }}>
            <strong>発送状況：</strong> 未発送
          </p>
        )}
      </div>

      <Link
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
      </Link>
    </div>
  );
}
