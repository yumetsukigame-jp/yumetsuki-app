"use client";

import { useEffect, useState } from "react";
import { db } from "../../../firebase";
import { collection, getDocs } from "firebase/firestore";

export default function NibuichiRankingPage() {
  const [loading, setLoading] = useState(true);
  const [weeklyRank, setWeeklyRank] = useState<any[]>([]);
  const [totalRank, setTotalRank] = useState<any[]>([]);

  useEffect(() => {
    fetchRanking();
  }, []);

  const fetchRanking = async () => {
    setLoading(true);

    const snap = await getDocs(collection(db, "nibuichi_user_stats"));
    const users = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));

    // -----------------------------
    // 累計ランキング
    // -----------------------------
    const total = users
      .filter((u) => (u.total ?? 0) > 0)
      .map((u) => ({
        uid: u.uid,
        total: u.total ?? 0,
        hit: u.hit ?? 0,
        rate: u.total > 0 ? u.hit / u.total : 0,
      }))
      .sort((a, b) => b.rate - a.rate);

    // -----------------------------
    // 週間ランキング
    // -----------------------------
    const weekly = users
      .filter((u) => (u.weeklyTotal ?? 0) > 0)
      .map((u) => ({
        uid: u.uid,
        weeklyTotal: u.weeklyTotal ?? 0,
        weeklyHit: u.weeklyHit ?? 0,
        weeklyRate:
          u.weeklyTotal > 0 ? u.weeklyHit / u.weeklyTotal : 0,
      }))
      .sort((a, b) => b.weeklyRate - a.weeklyRate);

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
          {totalRank.map((u, i) => (
            <li key={i} className="border-b pb-1">
              <div className="font-bold">
                {i + 1}位：{u.uid}
              </div>
              <div className="text-sm">
                参加：{u.total} 回 / 的中：{u.hit} 回
              </div>
              <div className="text-sm">
                正解率：{(u.rate * 100).toFixed(1)}%
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* 週間ランキング */}
      <div className="bg-white shadow p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-2">週間ランキング</h2>

        {weeklyRank.length === 0 && (
          <div className="text-gray-500">データがありません</div>
        )}

        <ul className="space-y-2">
          {weeklyRank.map((u, i) => (
            <li key={i} className="border-b pb-1">
              <div className="font-bold">
                {i + 1}位：{u.uid}
              </div>
              <div className="text-sm">
                参加：{u.weeklyTotal} 回 / 的中：{u.weeklyHit} 回
              </div>
              <div className="text-sm">
                正解率：{(u.weeklyRate * 100).toFixed(1)}%
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
