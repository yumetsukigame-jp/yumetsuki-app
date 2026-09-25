"use client";

import { useState } from "react";
import { db } from "@/firebase";
import { withRetry } from "@/app/lib/retry";
import {
  collection,
  doc,
  documentId,
  endAt,
  getDoc,
  getDocs,
  orderBy,
  query,
  startAt,
  where,
} from "firebase/firestore";

type PointAudit = {
  currentPoints: number;
  earned: {
    total: number;
    pointHistory: number;
    pointHistoryCount: number;
    quiz: number;
    quizCount: number;
    gachaRewards: number;
    gachaDrawCount: number;
  };
  spent: {
    confirmedTotal: number;
    shipping: number;
    shippingCount: number;
    knownGachaCosts: number;
    unknownGachaCostDrawCount: number;
  };
  balanceDifference: number;
};

type ShippingRecord = {
  id: string;
  collectionName: string;
  uid?: string;
  requestId?: string;
  rewardId?: string;
  name?: string;
  rewardName?: string;
  cost?: number;
  status?: string;
  shipped?: boolean;
  requestedAt?: unknown;
  timestamp?: unknown;
  shippedAt?: unknown;
};

const toNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const toMillis = (value: unknown) => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") return new Date(value).getTime();
  if (typeof value === "object" && "toMillis" in value) {
    const toMillisMethod = (value as { toMillis?: unknown }).toMillis;
    if (typeof toMillisMethod === "function") {
      return toMillisMethod.call(value);
    }
  }
  if (typeof value === "object" && "toDate" in value) {
    const toDateMethod = (value as { toDate?: unknown }).toDate;
    if (typeof toDateMethod === "function") {
      return toDateMethod.call(value).getTime();
    }
  }
  return 0;
};

async function fetchPointAudit(
  uid: string,
  currentPoints: number
): Promise<PointAudit> {
  const shippingCollectionNames = [
    "shippingPending",
    "shippingDone",
    "selectedRewards",
    "shippingHistory",
  ] as const;

  const [
    pointHistoryByUserId,
    pointHistoryByUser,
    activeGacha,
    archivedGacha,
    userGachaHistory,
    archivedQuizzes,
    ...shippingSnapshots
  ] = await Promise.all([
    withRetry(() =>
      getDocs(query(collection(db, "pointHistory"), where("userId", "==", uid)))
    ),
    withRetry(() =>
      getDocs(query(collection(db, "pointHistory"), where("user", "==", uid)))
    ),
    withRetry(() => getDocs(collection(db, "gachaCodes"))),
    withRetry(() => getDocs(collection(db, "gachaCodesArchive"))),
    withRetry(() =>
      getDocs(
        query(
          collection(db, "userGachaHistory"),
          orderBy(documentId()),
          startAt(`${uid}_`),
          endAt(`${uid}_\uf8ff`)
        )
      )
    ),
    withRetry(() => getDocs(collection(db, "quizzes_archive"))),
    ...shippingCollectionNames.map((collectionName) =>
      withRetry(() => getDocs(collection(db, collectionName)))
    ),
  ]);

  const pointHistory = new Map<string, Record<string, unknown>>();
  for (const historyDoc of [
    ...pointHistoryByUserId.docs,
    ...pointHistoryByUser.docs,
  ]) {
    pointHistory.set(historyDoc.id, historyDoc.data());
  }
  const pointHistoryTotal = Array.from(pointHistory.values()).reduce(
    (total, item) => total + toNumber(item.added),
    0
  );

  const quizAwardSnapshots = await Promise.all(
    archivedQuizzes.docs.map((quizDoc) =>
      withRetry(() =>
        getDoc(
          doc(
            db,
            "quizzes_archive",
            quizDoc.id,
            "rewardAwards",
            uid
          )
        )
      )
    )
  );
  let quizTotal = 0;
  let quizAwardCount = 0;
  for (const awardSnapshot of quizAwardSnapshots) {
    if (!awardSnapshot.exists()) continue;
    const award = awardSnapshot.data();
    if (award.status !== "awarded") continue;
    quizTotal += toNumber(award.amount);
    quizAwardCount += 1;
  }

  const gachaDefinitions = new Map<string, number>();
  for (const gachaDoc of [...activeGacha.docs, ...archivedGacha.docs]) {
    const data = gachaDoc.data();
    const code = typeof data.code === "string" ? data.code : gachaDoc.id;
    const cost = toNumber(data.point?.cost);
    if (!gachaDefinitions.has(code) || cost > 0) {
      gachaDefinitions.set(code, cost);
    }
  }

  const gachaCodes = new Set(gachaDefinitions.keys());
  for (const historyDoc of userGachaHistory.docs) {
    if (historyDoc.id.startsWith(`${uid}_`)) {
      gachaCodes.add(historyDoc.id.slice(uid.length + 1));
    }
  }

  const gachaResultSnapshots = await Promise.all(
    Array.from(gachaCodes).flatMap((code) => [
      withRetry(() =>
        getDocs(
          query(
            collection(db, "gachaResults", code, "results"),
            where("uid", "==", uid)
          )
        )
      ).then((snapshot) => ({ code, snapshot })),
      withRetry(() =>
        getDocs(
          query(
            collection(db, "gachaResultsArchive", code, "results"),
            where("uid", "==", uid)
          )
        )
      ).then((snapshot) => ({ code, snapshot })),
    ])
  );

  const gachaResults = new Map<
    string,
    { code: string; reward: number }
  >();
  for (const { code, snapshot } of gachaResultSnapshots) {
    for (const resultDoc of snapshot.docs) {
      const data = resultDoc.data();
      gachaResults.set(`${code}:${resultDoc.id}`, {
        code,
        reward: toNumber(data.reward),
      });
    }
  }

  let gachaRewardTotal = 0;
  let knownGachaCostTotal = 0;
  let unknownGachaCostDrawCount = 0;
  for (const result of gachaResults.values()) {
    gachaRewardTotal += result.reward;
    const cost = gachaDefinitions.get(result.code);
    if (cost === undefined) {
      unknownGachaCostDrawCount += 1;
    } else {
      knownGachaCostTotal += cost;
    }
  }

  const shippingRecords: ShippingRecord[] = [];
  shippingSnapshots.forEach((snapshot, index) => {
    const collectionName = shippingCollectionNames[index];
    for (const shippingDoc of snapshot.docs) {
      const data = shippingDoc.data();
      const recordUid =
        typeof data.uid === "string"
          ? data.uid
          : collectionName === "selectedRewards"
            ? shippingDoc.id
            : undefined;

      if (recordUid !== uid) continue;
      shippingRecords.push({
        ...data,
        id: shippingDoc.id,
        collectionName,
        uid: recordUid,
      });
    }
  });

  const shippingKey = (item: ShippingRecord) => {
    if (item.requestId) return `request:${item.requestId}`;

    const isDone =
      item.collectionName === "shippingDone" ||
      item.collectionName === "shippingHistory" ||
      item.status === "done" ||
      item.shipped === true;
    const eventTime = isDone
      ? item.shippedAt
      : item.requestedAt ?? item.timestamp;

    return [
      item.uid,
      item.rewardId ?? item.name ?? item.rewardName ?? "unknown",
      toNumber(item.cost),
      toMillis(eventTime),
    ].join(":");
  };

  const uniqueShippingRecords = new Map<string, ShippingRecord>();
  for (const item of shippingRecords) {
    const key = shippingKey(item);
    if (!uniqueShippingRecords.has(key)) {
      uniqueShippingRecords.set(key, item);
    }
  }
  const shippingTotal = Array.from(uniqueShippingRecords.values()).reduce(
    (total, item) => total + toNumber(item.cost),
    0
  );

  const earnedTotal = pointHistoryTotal + quizTotal + gachaRewardTotal;
  const confirmedSpentTotal = shippingTotal + knownGachaCostTotal;

  return {
    currentPoints,
    earned: {
      total: earnedTotal,
      pointHistory: pointHistoryTotal,
      pointHistoryCount: pointHistory.size,
      quiz: quizTotal,
      quizCount: quizAwardCount,
      gachaRewards: gachaRewardTotal,
      gachaDrawCount: gachaResults.size,
    },
    spent: {
      confirmedTotal: confirmedSpentTotal,
      shipping: shippingTotal,
      shippingCount: uniqueShippingRecords.size,
      knownGachaCosts: knownGachaCostTotal,
      unknownGachaCostDrawCount,
    },
    balanceDifference:
      currentPoints - (earnedTotal - confirmedSpentTotal),
  };
}

export default function PointAuditPanel({
  uid,
  currentPoints,
}: {
  uid: string;
  currentPoints: number;
}) {
  const [audit, setAudit] = useState<PointAudit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runAudit = async () => {
    if (loading) return;

    setLoading(true);
    setError("");
    try {
      setAudit(await fetchPointAudit(uid, currentPoints));
    } catch (auditError) {
      console.error("ポイント収支の集計に失敗しました", auditError);
      setError("ポイント収支を取得できませんでした。");
    } finally {
      setLoading(false);
    }
  };

  const differenceLabel =
    audit && audit.balanceDifference < 0
      ? "履歴で特定できない減少"
      : "履歴で特定できない増加";

  return (
    <div
      style={{
        marginTop: 14,
        padding: 12,
        border: "1px solid #bfdbfe",
        borderRadius: 8,
        background: "#eff6ff",
      }}
    >
      <button
        type="button"
        onClick={() => void runAudit()}
        disabled={loading}
        style={{
          padding: "8px 12px",
          color: "white",
          background: loading ? "#94a3b8" : "#0369a1",
          borderRadius: 6,
          border: "none",
          cursor: loading ? "not-allowed" : "pointer",
          fontWeight: 700,
        }}
      >
        {loading
          ? "ポイント収支を集計中…"
          : audit
            ? "ポイント収支を再集計"
            : "ポイント収支を集計"}
      </button>

      {error && <p style={{ color: "#dc2626", marginBottom: 0 }}>{error}</p>}

      {audit && (
        <div style={{ marginTop: 12, color: "#0f172a" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 8,
            }}
          >
            <AuditValue label="現在残高" value={audit.currentPoints} />
            <AuditValue label="確認できた獲得" value={audit.earned.total} />
            <AuditValue
              label="確認できた消費"
              value={audit.spent.confirmedTotal}
            />
            <AuditValue
              label={differenceLabel}
              value={Math.abs(audit.balanceDifference)}
              emphasize={audit.balanceDifference !== 0}
            />
          </div>

          <div style={{ marginTop: 12, fontSize: "0.88rem", lineHeight: 1.7 }}>
            <div>
              獲得内訳：ポイント履歴 {audit.earned.pointHistory.toLocaleString()} pt
              （{audit.earned.pointHistoryCount}件）、クイズ{" "}
              {audit.earned.quiz.toLocaleString()} pt（{audit.earned.quizCount}
              件）、ガチャ報酬 {audit.earned.gachaRewards.toLocaleString()} pt
              （{audit.earned.gachaDrawCount}回）
            </div>
            <div>
              消費内訳：発送物 {audit.spent.shipping.toLocaleString()} pt（
              {audit.spent.shippingCount}件）、確認可能なガチャ消費{" "}
              {audit.spent.knownGachaCosts.toLocaleString()} pt
            </div>
            {audit.spent.unknownGachaCostDrawCount > 0 && (
              <p style={{ margin: "8px 0 0", color: "#92400e" }}>
                元の設定が削除されたガチャが
                {audit.spent.unknownGachaCostDrawCount}回あり、その消費ポイントは
                「確認できた消費」に含まれていません。
              </p>
            )}
            <p style={{ margin: "8px 0 0", color: "#475569" }}>
              管理画面での直接編集や、上書きで失われた旧発送依頼など、履歴が残らない増減は差額に含まれます。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditValue({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div
      style={{
        padding: 10,
        borderRadius: 6,
        background: emphasize ? "#fef3c7" : "white",
      }}
    >
      <div style={{ color: "#64748b", fontSize: "0.78rem", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ marginTop: 2, fontSize: "1.1rem", fontWeight: 700 }}>
        {value.toLocaleString()} pt
      </div>
    </div>
  );
}
