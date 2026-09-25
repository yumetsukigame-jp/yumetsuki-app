"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { db, auth } from "../../firebase";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import LoadingState from "@/app/components/LoadingState";
import { withRetry } from "@/app/lib/retry";

type RewardRecord = {
  id: string;
  requestId?: string;
  name?: string;
  cost?: number;
  image?: string | null;
  requestedAt?: { toDate: () => Date } | Date | null;
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

  const toMillis = (
    value:
      | RewardRecord["requestedAt"]
      | RewardRecord["timestamp"]
      | RewardRecord["shippedAt"]
  ) => {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if ("toDate" in value) return value.toDate().getTime();
    return new Date(value).getTime();
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      const uid = user.uid;

      try {
        const loadRecords = async (
          collectionName: string,
          status: "pending" | "done" | null
        ) => {
          const snapshot = await withRetry(() =>
            getDocs(
              query(
                collection(db, collectionName),
                where("uid", "==", uid)
              )
            )
          );

          return snapshot.docs.map((document) => {
            const data = document.data();
            const resolvedStatus =
              status ?? data.status ?? (data.shipped ? "done" : "pending");

            return {
              id: document.id,
              ...data,
              status: resolvedStatus,
              shipped: resolvedStatus === "done",
            } as RewardRecord;
          });
        };

        const [pendingRecords, doneRecords, legacyRecords] = await Promise.all([
          loadRecords("shippingPending", "pending"),
          loadRecords("shippingDone", "done"),
          loadRecords("selectedRewards", null),
        ]);

        const records = new Map<string, RewardRecord>();
        for (const record of [
          ...pendingRecords,
          ...doneRecords,
          ...legacyRecords,
        ]) {
          const key = record.requestId ?? record.id;
          if (!records.has(key)) records.set(key, record);
        }

        const latest =
          Array.from(records.values()).sort((a, b) => {
            const aTime = toMillis(
              a.shippedAt ?? a.requestedAt ?? a.timestamp
            );
            const bTime = toMillis(
              b.shippedAt ?? b.requestedAt ?? b.timestamp
            );
            return bTime - aTime;
          })[0] ?? null;

        setReward(latest);
      } catch (error) {
        console.error("発送物情報の読み込みに失敗しました", error);
        setReward(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);
  if (loading) return <LoadingState />;

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
