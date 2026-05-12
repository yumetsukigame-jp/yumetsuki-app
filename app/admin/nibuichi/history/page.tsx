"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

export default function NibuichiHistoryPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState<string>("");
  const [daily, setDaily] = useState<any>(null);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [winners, setWinners] = useState<any[]>([]);
  const [perUserReward, setPerUserReward] = useState<number>(0);

  // -----------------------------
  // 管理者判定
  // -----------------------------
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

  // -----------------------------
  // 日付変更 → データ取得
  // -----------------------------
  useEffect(() => {
    if (!selectedDate) return;
    fetchDailyData(selectedDate);
  }, [selectedDate]);

  // -----------------------------
  // Firestore から日別データ取得
  // -----------------------------
  const fetchDailyData = async (date: string) => {
    setDaily(null);
    setPredictions([]);
    setWinners([]);
    setPerUserReward(0);

    // daily
    const dailyRef = doc(db, "nibuichi_daily", date);
    const dailySnap = await getDoc(dailyRef);

    if (!dailySnap.exists()) {
      setDaily(null);
      return;
    }

    const dailyData = dailySnap.data();
    setDaily(dailyData);

    // predictions
    const predRef = collection(db, "nibuichi_user_predictions");
    const q = query(predRef, where("date", "==", date));
    const predSnap = await getDocs(q);

    const preds = predSnap.docs.map((d) => d.data());
    setPredictions(preds);

    // winners
    const wins = preds.filter((p) => p.prediction === dailyData.result);
    setWinners(wins);

    // per-user reward
    if (wins.length > 0 && dailyData.rewardPoints > 0) {
      setPerUserReward(Math.floor(dailyData.rewardPoints / wins.length));
    }
  };

  if (loading) {
    return <div className="p-6 text-center">読み込み中…</div>;
  }

  if (!user) {
    return <div className="p-6 text-center">管理者のみアクセスできます</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">

      <h1 className="text-xl font-bold text-center">ニブイチ 日別履歴 & 予想一覧</h1>

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

      {/* 日別データ */}
      {daily && (
        <div className="bg-white shadow p-4 rounded-lg space-y-2">
          <h2 className="text-lg font-bold">日別データ</h2>

          <div>結果：{daily.result}</div>
          <div>配布ポイント：{daily.rewardPoints}</div>
          <div>集計済み：{daily.processed ? "はい" : "いいえ"}</div>

          <div>正解者数：{winners.length}</div>
          <div>1人あたりの山分けポイント：{perUserReward}</div>
        </div>
      )}

      {/* 正解者一覧 */}
      {winners.length > 0 && (
        <div className="bg-white shadow p-4 rounded-lg">
          <h2 className="text-lg font-bold mb-2">正解者一覧</h2>
          <ul className="space-y-1">
            {winners.map((w, i) => (
              <li key={i} className="border-b py-1">
                UID：{w.uid}（予想：{w.prediction}）
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 全ユーザー予想一覧 */}
      {predictions.length > 0 && (
        <div className="bg-white shadow p-4 rounded-lg">
          <h2 className="text-lg font-bold mb-2">全ユーザー予想一覧</h2>
          <ul className="space-y-1">
            {predictions.map((p, i) => (
              <li key={i} className="border-b py-1">
                UID：{p.uid}（予想：{p.prediction}）
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* データがない場合 */}
      {selectedDate && !daily && (
        <div className="text-center text-gray-500">
          この日のデータはありません
        </div>
      )}
    </div>
  );
}
