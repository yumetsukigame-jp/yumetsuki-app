"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

export default function NibuichiHistoryPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState<string>("");

  // 結果（nibuichi_global）
  const [daily, setDaily] = useState<any>(null);

  // 投票状況（nibuichi_user_predictions）
  const [predictions, setPredictions] = useState<any[]>([]);

  // 集計後履歴（nibuichi_daily）
  const [history, setHistory] = useState<any[]>([]);

  const [winners, setWinners] = useState<any[]>([]);
  const [perUserReward, setPerUserReward] = useState<number>(0);

  const [userMap, setUserMap] = useState<Record<string, any>>({});

  /* ============================================================
     管理者チェック
  ============================================================ */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setLoading(false);
        return;
      }

      const adminRef = doc(db, "admins", u.uid);
      const adminSnap = await getDoc(adminRef);

      if (!adminSnap.exists()) {
        setUser(null);
        setLoading(false);
        return;
      }

      setUser(u);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  /* ============================================================
     日付変更 → データ取得
  ============================================================ */
  useEffect(() => {
    if (!selectedDate) return;
    fetchDailyData(selectedDate);
  }, [selectedDate]);

  /* ============================================================
     日別データ取得（結果・投票状況・履歴）
  ============================================================ */
  const fetchDailyData = async (date: string) => {
    setDaily(null);
    setPredictions([]);
    setHistory([]);
    setWinners([]);
    setPerUserReward(0);
    setUserMap({});

    const normalizedDate = date;

    /* -----------------------------
       ① 結果（nibuichi_global）
    ----------------------------- */
    const dailyRef = doc(db, "nibuichi_global", normalizedDate);
    const dailySnap = await getDoc(dailyRef);

    let dailyData = null;
    if (dailySnap.exists()) {
      dailyData = dailySnap.data();
      setDaily(dailyData);
    }

    /* -----------------------------
       ② 投票状況（nibuichi_user_predictions）
    ----------------------------- */
    const predRef = collection(db, "nibuichi_user_predictions");
    const qPred = query(predRef, where("date", "==", normalizedDate));
    const predSnap = await getDocs(qPred);

    const preds = predSnap.docs.map((d) => d.data());
    setPredictions(preds);

    /* -----------------------------
       ③ 集計後履歴（nibuichi_daily）
    ----------------------------- */
    const histCol = collection(db, "nibuichi_daily", normalizedDate, "predictions");
    const histSnap = await getDocs(histCol);

    const histList = histSnap.docs.map((d) => d.data());
    setHistory(histList);

    /* -----------------------------
       ④ 正解者計算（結果がある場合のみ）
    ----------------------------- */
    if (dailyData) {
      const wins = preds.filter((p) => p.prediction === dailyData.result);
      setWinners(wins);

      if (wins.length > 0 && dailyData.rewardPoints > 0) {
        setPerUserReward(Math.floor(dailyData.rewardPoints / wins.length));
      }
    }

    /* -----------------------------
       ⑤ ユーザー情報取得（predictions + history 両方）
    ----------------------------- */
    const map: Record<string, any> = {};

    const allUids = new Set([
      ...preds.map((p) => p.uid),
      ...histList.map((h) => h.uid),
    ]);

    for (const uid of allUids) {
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const u = userSnap.data();
        map[uid] = {
          nickname: u.displayName ?? "名無し",
          xAccount: u.xAccount ?? "",
        };
      } else {
        map[uid] = {
          nickname: "不明ユーザー",
          xAccount: "",
        };
      }
    }

    setUserMap(map);
  };

  /* ============================================================
     UI
  ============================================================ */
  if (loading) {
    return <div className="p-6 text-center">読み込み中…</div>;
  }

  if (!user) {
    return <div className="p-6 text-center">管理者のみアクセスできます</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <h1 className="text-xl font-bold text-center">
        ニブイチ 日別履歴 & 投票状況（管理者）
      </h1>

      {/* 日付選択 */}
      <div className="bg-white shadow p-4 rounded-lg">
        <label className="font-bold">日付を選択：</label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="border p-2 rounded w-full mt-1"
        />
      </div>

      {/* 結果 */}
      <div className="bg-white shadow p-4 rounded-lg space-y-2">
        <h2 className="text-lg font-bold">結果（nibuichi_global）</h2>

        <div>結果：{daily?.result ?? "未確定"}</div>
        <div>配布ポイント：{daily?.rewardPoints ?? 0}</div>
        <div>集計済み：{daily?.processed ? "はい" : "いいえ"}</div>

        {daily ? (
          <>
            <div>正解者数：{winners.length}</div>
            <div>1人あたりの山分けポイント：{perUserReward}</div>
          </>
        ) : (
          <div className="text-gray-500">※ 当日のため未確定です</div>
        )}
      </div>

      {/* 集計後履歴（nibuichi_daily） */}
      {history.length > 0 && (
        <div className="bg-white shadow p-4 rounded-lg">
          <h2 className="text-lg font-bold mb-2">集計後履歴（nibuichi_daily）</h2>
          <ul className="space-y-1">
            {history.map((h, i) => {
              const info = userMap[h.uid] ?? {};
              return (
                <li key={i} className="border-b py-1">
                  {info.nickname ?? "不明ユーザー"}（{info.xAccount ?? ""}）
                  <span className="text-gray-500">
                    {" "} / 予想：{h.prediction} / 結果：{h.result} / {perUserReward}pt
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 投票状況 */}
      {predictions.length > 0 && (
        <div className="bg-white shadow p-4 rounded-lg">
          <h2 className="text-lg font-bold mb-2">全ユーザーの投票状況</h2>
          <ul className="space-y-1">
            {predictions.map((p, i) => {
              const info = userMap[p.uid] ?? {};
              return (
                <li key={i} className="border-b py-1">
                  {info.nickname}（{info.xAccount}）
                  <span className="text-gray-500"> / 予想：{p.prediction}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* データなし */}
      {selectedDate && !daily && predictions.length === 0 && history.length === 0 && (
        <div className="text-center text-gray-500">
          この日のデータはありません
        </div>
      )}
    </div>
  );
}
