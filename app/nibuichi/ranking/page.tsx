"use client";

import { useEffect, useState } from "react";
import { db } from "../../../firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";

export default function NibuichiRankingPage() {
  const [loading, setLoading] = useState(true);
  const [weeklyRank, setWeeklyRank] = useState<any[]>([]);
  const [totalRank, setTotalRank] = useState<any[]>([]);
  const [userMap, setUserMap] = useState<Record<string, any>>({});
  const [showMoreTotal, setShowMoreTotal] = useState(false);
  const [showMoreWeekly, setShowMoreWeekly] = useState(false);

  /* -----------------------------
     同順位を同じ順位にする関数
  ----------------------------- */
  const assignRanks = (list: any[], key: string) => {
    let lastValue: number | null = null;
    let lastRank = 0;

    return list.map((item, index) => {
      const value = item[key];

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

  useEffect(() => {
    fetchRanking();
  }, []);

  const fetchRanking = async () => {
    setLoading(true);

    const snap = await getDocs(collection(db, "nibuichi_user_stats"));
    const users = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));

    /* -----------------------------
       ユーザー情報取得
    ----------------------------- */
    const map: Record<string, any> = {};

    for (const u of users) {
      const userRef = doc(db, "users", u.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const data = userSnap.data();
        map[u.uid] = {
          nickname: data.displayName ?? "名無し",
          xAccount: data.xAccount ?? "",
        };
      } else {
        map[u.uid] = {
          nickname: "不明ユーザー",
          xAccount: "",
        };
      }
    }

    setUserMap(map);

    /* -----------------------------
       累計ランキング（score = hit × rate）
    ----------------------------- */
    let total = users
      .filter((u) => (u.total ?? 0) > 0)
      .map((u) => {
        const total = u.total ?? 0;
        const hit = u.hit ?? 0;
        const rate = total > 0 ? hit / total : 0;
        const score = hit * rate;

        return {
          uid: u.uid,
          total,
          hit,
          rate,
          score,
        };
      })
      .sort((a, b) => b.score - a.score);

    total = assignRanks(total, "score");

    /* -----------------------------
       週間ランキング（weeklyScore = weeklyHit × weeklyRate）
    ----------------------------- */
    let weekly = users
      .filter((u) => (u.weeklyTotal ?? 0) > 0)
      .map((u) => {
        const total = u.weeklyTotal ?? 0;
        const hit = u.weeklyHit ?? 0;
        const rate = total > 0 ? hit / total : 0;
        const score = hit * rate;

        return {
          uid: u.uid,
          weeklyTotal: total,
          weeklyHit: hit,
          weeklyRate: rate,
          weeklyScore: score,
        };
      })
      .sort((a, b) => b.weeklyScore - a.weeklyScore);

    weekly = assignRanks(weekly, "weeklyScore");

    setTotalRank(total);
    setWeeklyRank(weekly);
    setLoading(false);
  };

  if (loading) {
    return <div className="p-6 text-center">読み込み中…</div>;
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
            const info = userMap[u.uid] ?? {};
            return (
              <li key={u.uid} className="border-b pb-1">
                <div className="font-bold">
                  {u.rank}位：{info.nickname}（{info.xAccount}）
                </div>
                <div className="text-sm">
                  参加：{u.total} 回 / 的中：{u.hit} 回
                </div>
                <div className="text-sm">
                  スコア：{u.score.toFixed(3)}
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
            const info = userMap[u.uid] ?? {};
            return (
              <li key={u.uid} className="border-b pb-1">
                <div className="font-bold">
                  {u.rank}位：{info.nickname}（{info.xAccount}）
                </div>
                <div className="text-sm">
                  参加：{u.weeklyTotal} 回 / 的中：{u.weeklyHit} 回
                </div>
                <div className="text-sm">
                  スコア：{u.weeklyScore.toFixed(3)}
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
