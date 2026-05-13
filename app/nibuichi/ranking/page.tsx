"use client";

import { useEffect, useState } from "react";
import { db } from "../../../firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";

export default function NibuichiRankingPage() {
  const [loading, setLoading] = useState(true);
  const [weeklyRank, setWeeklyRank] = useState<any[]>([]);
  const [totalRank, setTotalRank] = useState<any[]>([]);
  const [userMap, setUserMap] = useState<Record<string, any>>({});

  /* -----------------------------
     今週の開始日（月曜）を計算
  ----------------------------- */
  const getWeekStartDate = () => {
    const d = new Date();
    const day = d.getDay(); // 0=日曜, 1=月曜
    const diff = (day === 0 ? -6 : 1 - day); // 月曜基準
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  };

  /* -----------------------------
     今週の終了日（日曜）を計算
  ----------------------------- */
  const getWeekEndDate = () => {
    const start = new Date(getWeekStartDate());
    start.setDate(start.getDate() + 6); // 月曜 + 6 = 日曜
    return start.toISOString().slice(0, 10);
  };

  useEffect(() => {
    fetchRanking();
  }, []);

  const fetchRanking = async () => {
    setLoading(true);

    // -----------------------------
    // ユーザー戦績を取得
    // -----------------------------
    const snap = await getDocs(collection(db, "nibuichi_user_stats"));
    const users = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));

    // -----------------------------
    // ユーザー情報（displayName / xAccount）を取得
    // -----------------------------
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

  const weekStart = getWeekStartDate();
  const weekEnd = getWeekEndDate();

  return (
    <div className="max-w-md mx-auto p-4 space-y-8">

      <h1 className="text-xl font-bold text-center">ニブイチ ランキング</h1>

      {/* 今週の期間 */}
      <div className="text-center text-sm text-gray-600">
        今週：{weekStart} 〜 {weekEnd}
      </div>

      {/* 累計ランキング */}
      <div className="bg-white shadow p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-2">累計ランキング</h2>

        {totalRank.length === 0 && (
          <div className="text-gray-500">データがありません</div>
        )}

        <ul className="space-y-2">
          {totalRank.map((u, i) => {
            const info = userMap[u.uid] ?? {};
            return (
              <li key={i} className="border-b pb-1">
                <div className="font-bold">
                  {i + 1}位：{info.nickname}（{info.xAccount}）
                </div>
                <div className="text-sm">
                  参加：{u.total} 回 / 的中：{u.hit} 回
                </div>
                <div className="text-sm">
                  正解率：{(u.rate * 100).toFixed(1)}%
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 週間ランキング */}
      <div className="bg-white shadow p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-2">週間ランキング</h2>

        {weeklyRank.length === 0 && (
          <div className="text-gray-500">データがありません</div>
        )}

        <ul className="space-y-2">
          {weeklyRank.map((u, i) => {
            const info = userMap[u.uid] ?? {};
            return (
              <li key={i} className="border-b pb-1">
                <div className="font-bold">
                  {i + 1}位：{info.nickname}（{info.xAccount}）
                </div>
                <div className="text-sm">
                  参加：{u.weeklyTotal} 回 / 的中：{u.weeklyHit} 回
                </div>
                <div className="text-sm">
                  正解率：{(u.weeklyRate * 100).toFixed(1)}%
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
