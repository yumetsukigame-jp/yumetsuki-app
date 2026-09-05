"use client";

import { useEffect, useState } from "react";
import { db } from "../../../firebase";
import {
  collection,
  documentId,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import LoadingState from "@/app/components/LoadingState";
import { withRetry } from "@/app/lib/retry";

type UserStat = {
  uid: string;
  total?: number;
  hit?: number;
  weeklyTotal?: number;
  weeklyHit?: number;
  [key: string]: unknown;
};

type RankRow = {
  uid: string;
  total: number;
  hit: number;
  rate: number;
  score: number;
  weeklyTotal: number;
  weeklyHit: number;
  weeklyRate: number;
  weeklyScore: number;
  rank?: number;
};

export default function NibuichiRankingPage() {
  const [loading, setLoading] = useState(true);
  const [weeklyRank, setWeeklyRank] = useState<RankRow[]>([]);
  const [totalRank, setTotalRank] = useState<RankRow[]>([]);
  const [userMap, setUserMap] = useState<Record<string, { nickname: string; xAccount: string }>>({});
  const [showMoreTotal, setShowMoreTotal] = useState(false);
  const [showMoreWeekly, setShowMoreWeekly] = useState(false);

  /* -----------------------------
     同順位を同じ順位にする関数
  ----------------------------- */
  const assignRanks = (list: RankRow[], key: "score" | "weeklyScore") => {
    let lastValue: number | null = null;
    let lastRank = 0;

    return list.map((item, index) => {
      const value = Number(item[key] ?? 0);

      if (value === lastValue) {
        item.rank = lastRank;
      } else {
        item.rank = index + 1;
        lastRank = item.rank;
        lastValue = value;
      }

      return item;
    });
  };


  async function fetchRanking() {
    setLoading(true);
    try {
      const snap = await withRetry(() => getDocs(collection(db, "nibuichi_user_stats")));
      const users = snap.docs.map((d) => ({
      uid: d.id,
      ...(d.data() as Record<string, unknown>),
      } as UserStat));

    /* -----------------------------
       ユーザー情報取得
    ----------------------------- */
    const map: Record<string, { nickname: string; xAccount: string }> = {};
    const userIds = users.map((user) => user.uid);
    const userIdBatches = Array.from({ length: Math.ceil(userIds.length / 30) }, (_, index) =>
      userIds.slice(index * 30, index * 30 + 30)
    );

    const userSnapshots = await Promise.all(
      userIdBatches.map((batch) =>
        withRetry(() =>
          getDocs(
            query(
              collection(db, "users"),
              where(documentId(), "in", batch)
            )
          )
        )
      )
    );

    for (const userSnapshotsBatch of userSnapshots) {
      for (const userSnap of userSnapshotsBatch.docs) {
        const data = userSnap.data();
        map[userSnap.id] = {
          nickname: data.displayName ?? "名無し",
          xAccount: data.xAccount ?? "",
        };
      }
    }

    for (const userId of userIds) {
      map[userId] ??= { nickname: "不明ユーザー", xAccount: "" };
    }

    setUserMap(map);

    /* -----------------------------
       累計ランキング（score = hit × rate）
    ----------------------------- */
    let total = users
      .filter((u) => (u.total ?? 0) > 0)
      .map((u) => {
        const total = Number(u.total ?? 0);
        const hit = Number(u.hit ?? 0);
        const rate = total > 0 ? hit / total : 0;
        const score = hit * rate;

        return {
          uid: u.uid,
          total,
          hit,
          rate,
          score,
          weeklyTotal: 0,
          weeklyHit: 0,
          weeklyRate: 0,
          weeklyScore: 0,
        } satisfies RankRow;
      })
      .sort((a, b) => b.score - a.score);

    total = assignRanks(total, "score");

    /* -----------------------------
       週間ランキング（参加数優先 → スコア順）
    ----------------------------- */
    let weekly = users
      .filter((u) => (u.weeklyTotal ?? 0) > 0)
      .map((u) => {
        const total = Number(u.weeklyTotal ?? 0);
        const hit = Number(u.weeklyHit ?? 0);
        const rate = total > 0 ? hit / total : 0;
        const score = hit * rate;

        return {
          uid: u.uid,
          total: 0,
          hit: 0,
          rate: 0,
          score: 0,
          weeklyTotal: total,
          weeklyHit: hit,
          weeklyRate: rate,
          weeklyScore: score,
        } satisfies RankRow;
      })
      .sort((a, b) => {
        // ★ ① 参加数優先
        if (b.weeklyTotal !== a.weeklyTotal) {
          return b.weeklyTotal - a.weeklyTotal;
        }
        // ★ ② スコア順
        return b.weeklyScore - a.weeklyScore;
      });

    weekly = assignRanks(weekly, "weeklyScore");

      setTotalRank(total);
      setWeeklyRank(weekly);
    } catch (error) {
      console.error("ニブイチランキングの読み込みに失敗しました", error);
      setTotalRank([]);
      setWeeklyRank([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void Promise.resolve().then(fetchRanking);
  }, []);


  if (loading) {
    return <LoadingState className="p-6 text-center" />;
  }

  return (
    <div className="max-w-md mx-auto p-4 space-y-8">

      <h1 className="text-xl font-bold text-center">ニブイチ ランキング</h1>

      {/* 累計ランキング */}
      <div className="bg-white shadow p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-2">累計ランキング</h2>

        {totalRank.length === 0 && (
          <div className="text-gray-500">データがありません</div>
        )}

        <ul className="space-y-2">
          {(showMoreTotal ? totalRank : totalRank.slice(0, 20)).map((u) => {
            const info = userMap[u.uid] ?? { nickname: "不明ユーザー", xAccount: "" };

            let colorClass = "";
            if (u.rank === 1) colorClass = "bg-yellow-100 border-yellow-400";
            else if (u.rank === 2) colorClass = "bg-gray-100 border-gray-400";
            else if (u.rank === 3) colorClass = "bg-orange-100 border-orange-400";

            return (
              <li key={u.uid} className={`border-b pb-1 rounded ${colorClass}`}>
                <div className="font-bold">
                  {u.rank}位：{info.nickname}（{info.xAccount}）
                </div>
                <div className="text-sm">
                  参加：{u.total} 回 / 的中：{u.hit} 回
                </div>
                <div className="text-sm">
                  的中率：{((u.rate ?? 0) * 100).toFixed(1)}%
                </div>
                <div className="text-sm font-bold text-blue-600">
                  スコア：{(u.score ?? 0).toFixed(3)}
                </div>
              </li>
            );
          })}
        </ul>

        {totalRank.length > 20 && (
          <div className="text-center mt-3">
            <button
              onClick={() => setShowMoreTotal(!showMoreTotal)}
              className="px-3 py-1 bg-gray-200 rounded"
            >
              {showMoreTotal ? "閉じる" : "もっと見る"}
            </button>
          </div>
        )}
      </div>

      {/* 週間ランキング */}
      <div className="bg-white shadow p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-2">週間ランキング</h2>

        {weeklyRank.length === 0 && (
          <div className="text-gray-500">データがありません</div>
        )}

        <ul className="space-y-2">
          {(showMoreWeekly ? weeklyRank : weeklyRank.slice(0, 20)).map((u) => {
            const info = userMap[u.uid] ?? { nickname: "不明ユーザー", xAccount: "" };

            let colorClass = "";
            if (u.rank === 1) colorClass = "bg-yellow-100 border-yellow-400";
            else if (u.rank === 2) colorClass = "bg-gray-100 border-gray-400";
            else if (u.rank === 3) colorClass = "bg-orange-100 border-orange-400";

            return (
              <li key={u.uid} className={`border-b pb-1 rounded ${colorClass}`}>
                <div className="font-bold">
                  {u.rank}位：{info.nickname}（{info.xAccount}）
                </div>
                <div className="text-sm">
                  参加：{u.weeklyTotal} 回 / 的中：{u.weeklyHit} 回
                </div>
                <div className="text-sm">
                  的中率：{((u.weeklyRate ?? 0) * 100).toFixed(1)}%
                </div>
                <div className="text-sm font-bold text-blue-600">
                  スコア：{(u.weeklyScore ?? 0).toFixed(3)}
                </div>
              </li>
            );
          })}
        </ul>

        {weeklyRank.length > 20 && (
          <div className="text-center mt-3">
            <button
              onClick={() => setShowMoreWeekly(!showMoreWeekly)}
              className="px-3 py-1 bg-gray-200 rounded"
            >
              {showMoreWeekly ? "閉じる" : "もっと見る"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
