"use client";

import { useEffect, useState } from "react";
import { db, auth } from "../../firebase";  // ← ★ これが正しい
import {
  collection,
  query,
  where,
  getDocs
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import LoadingState from "@/app/components/LoadingState";
import { withRetry } from "@/app/lib/retry";

type FirestoreDateLike =
  | { toDate?: () => Date; _seconds?: number; seconds?: number }
  | Date
  | null
  | undefined;

type HistoryItem = {
  id: string;
  source: "pending" | "done" | "history" | "legacy";
  requestId?: string;
  rewardId?: string;
  uid?: string;
  image?: string | null;
  name?: string;
  cost?: number;
  requestedAt?: FirestoreDateLike;
  timestamp?: FirestoreDateLike;
  status?: "pending" | "done";
  shipped?: boolean;
  shippedAt?: FirestoreDateLike;
  [key: string]: unknown;
};

const toDisplayDate = (value?: FirestoreDateLike) => {
  if (!value) return "不明";
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toLocaleString();
  }
  return "不明";
};

const toMillis = (value?: FirestoreDateLike) => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }
  if (typeof value === "object") {
    const seconds = value.seconds ?? value._seconds;
    return typeof seconds === "number" ? seconds * 1000 : 0;
  }
  return 0;
};

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const getStatusLabel = (item: HistoryItem) => {
    if (item.status) {
      return item.status === "done" ? "発送済み" : "準備中";
    }
    return item.shipped ? "発送済み" : "準備中";
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const loadCollection = async (
          collectionName: string,
          source: HistoryItem["source"]
        ) => {
          const snapshot = await withRetry(() =>
            getDocs(
              query(
                collection(db, collectionName),
                where("uid", "==", user.uid)
              )
            )
          );

          return snapshot.docs.map((document) => {
            const data = document.data() as Record<string, unknown>;
            const isDone =
              source === "done" ||
              source === "history" ||
              data.status === "done" ||
              data.shipped === true;

            return {
              id: document.id,
              ...data,
              source,
              name:
                typeof data.name === "string"
                  ? data.name
                  : typeof data.rewardName === "string"
                    ? data.rewardName
                    : "名称不明",
              status: isDone ? "done" : "pending",
              shipped: isDone,
            } as HistoryItem;
          });
        };

        const [pendingItems, doneItems, historyItems, legacyItems] =
          await Promise.all([
            loadCollection("shippingPending", "pending"),
            loadCollection("shippingDone", "done"),
            loadCollection("shippingHistory", "history"),
            loadCollection("selectedRewards", "legacy"),
          ]);

        const getRecordKey = (item: HistoryItem) => {
          if (item.requestId) return `request:${item.requestId}`;

          const eventTime =
            item.status === "done"
              ? item.shippedAt
              : item.requestedAt ?? item.timestamp;

          return [
            item.uid ?? user.uid,
            item.rewardId ?? item.name ?? "unknown",
            toMillis(eventTime),
          ].join(":");
        };

        const records = new Map<string, HistoryItem>();
        for (const item of [
          ...pendingItems,
          ...doneItems,
          ...historyItems,
          ...legacyItems,
        ]) {
          const key = getRecordKey(item);
          if (!records.has(key)) records.set(key, item);
        }

        setHistory(
          Array.from(records.values()).sort((a, b) => {
            const aTime = toMillis(a.shippedAt ?? a.requestedAt ?? a.timestamp);
            const bTime = toMillis(b.shippedAt ?? b.requestedAt ?? b.timestamp);
            return bTime - aTime;
          })
        );
      } catch (error) {
        console.error("発送履歴の読み込みに失敗しました", error);
        setHistory([]);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>発送履歴</h1>

      {history.length === 0 && <p>まだ発送履歴がありません。</p>}

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
              alignItems: "center",
            }}
          >
            {item.image && (
              <img
                src={item.image}
                alt={item.name}
                style={{
                  width: "80px",
                  height: "80px",
                  objectFit: "contain",
                }}
              />
            )}

            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: "18px" }}>{item.name}</h2>
              <p>消費ポイント：{item.cost} pt</p>

              <p>
                依頼日時：{" "}
                {toDisplayDate(item.requestedAt ?? item.timestamp)}
              </p>

              <p>
                状態：{" "}
                <strong
                  style={{
                    color:
                      item.status === "done" || item.shipped ? "green" : "orange",
                  }}
                >
                  {getStatusLabel(item)}
                </strong>
              </p>

              {item.shippedAt && (
                <p>
                  発送日時：{" "}
                  {toDisplayDate(item.shippedAt)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
