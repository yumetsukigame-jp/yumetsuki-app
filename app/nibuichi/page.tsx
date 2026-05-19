"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { auth, functions, db } from "../../firebase";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";

export default function NibuichiPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState<any>(null);
  const [todayPrediction, setTodayPrediction] = useState<any>(null);
  const [globalStats, setGlobalStats] = useState<any>(null);
  const [todayResult, setTodayResult] = useState<any>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [predictionStats, setPredictionStats] = useState<any>(null);

  // -----------------------------
  // JST 今日の日付（6時切り替え）
  // -----------------------------
  const getTodayJST6 = () => {
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
    );
    if (now.getHours() < 6) now.setDate(now.getDate() - 1);
    return now.toISOString().slice(0, 10);
  };

  // -----------------------------
  // ログイン監視
  // -----------------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) fetchStats();
      else setLoading(false);
    });
    return () => unsub();
  }, []);

  // -----------------------------
  // 今日の予想者数を取得（棒グラフ用）
  // -----------------------------
  const fetchTodayPredictions = async () => {
    const today = getTodayJST6();

    const q = query(
      collection(db, "nibuichi_user_predictions"),
      where("date", "==", today)
    );

    const snap = await getDocs(q);

    const counts = {
      bakuado: 0,
      nibuni: 0,
      nibuichi: 0,
      nibuzero: 0,
      total: snap.size,
    };

    snap.forEach((doc) => {
      const p = doc.data().prediction;
      if (counts[p] !== undefined) counts[p]++;
    });

    setPredictionStats(counts);
  };

  // -----------------------------
  // 戦績・今日の予想取得
  // -----------------------------
  const fetchStats = async () => {
    setLoading(true);
    try {
      const todayJST = getTodayJST6();

      const fn = httpsCallable(functions, "getNibuichiUserStats");
      const res: any = await fn({ date: todayJST });

      setStats(res.data.stats ?? null);
      setTodayPrediction(res.data.todayPrediction ?? null);
      setGlobalStats(res.data.global ?? null);
      setTodayResult(res.data.todayResult ?? null);

      if (res.data.todayPrediction?.prediction) {
        setSelected(res.data.todayPrediction.prediction);
      }

      // ★ 予想済みなら棒グラフ用データを取得
      if (res.data.todayPrediction?.prediction) {
        await fetchTodayPredictions();
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // -----------------------------
  // 今日の予想を確定
  // -----------------------------
  const sendPrediction = async () => {
    if (!user || !selected) return;

    if (todayResult?.processed === true) return;
    if (todayPrediction?.prediction) return;

    setSending(true);
    try {
      const fn = httpsCallable(functions, "saveNibuichiPrediction");
      await fn({ prediction: selected });

      await fetchStats();
    } catch (err) {
      console.error(err);
    }
    setSending(false);
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-600">読み込み中…</div>;
  }

  if (!user) {
    return <div className="p-6 text-center text-gray-600">ログインしてください</div>;
  }

  const options = [
    { key: "bakuado", label: "爆アド", img: "/nibuichi/bakuado.webp" },
    { key: "nibuni", label: "ニブニ", img: "/nibuichi/nibuni.webp" },
    { key: "nibuichi", label: "ニブイチ", img: "/nibuichi/nibuichi.webp" },
    { key: "nibuzero", label: "ニブゼロ", img: "/nibuichi/nibuzero.webp" },
  ];

  const isFixed = todayResult?.processed === true;

  return (
    <div className="max-w-md mx-auto p-4 space-y-6">

      <div className="w-full">
        <Image
          src="/nibuichi/top.webp"
          alt="ニブイチ"
          width={800}
          height={400}
          className="rounded-lg"
        />
      </div>

      {/* ゆめつき戦績 */}
      <div className="bg-white shadow p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-2">ゆめつきの戦績</h2>
        <div className="space-y-1 text-sm">
          <div>勝（ニブニ）：{globalStats?.win ?? 0}</div>
          <div>分（ニブイチ）：{globalStats?.draw ?? 0}</div>
          <div>敗（ニブゼロ）：{globalStats?.lose ?? 0}</div>
          <div>爆アド：{globalStats?.bakuado ?? 0}</div>
        </div>
      </div>

      {/* 個人戦績 */}
      <div className="bg-white shadow p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-2">個人戦績</h2>
        <div className="space-y-1 text-sm">
          <div>参加数：{stats?.total ?? 0}</div>
          <div>的中数：{stats?.hit ?? 0}</div>
          <div>
            的中率：
            {stats?.total > 0
              ? ((stats.hit / stats.total) * 100).toFixed(1) + "%"
              : "0%"}
          </div>
        </div>
      </div>

      {/* ★ 今日の予想状況（棒グラフ） */}
      {todayPrediction?.prediction && predictionStats && (
        <div className="bg-white shadow p-4 rounded-lg">
          <h2 className="text-lg font-bold mb-3">今日の予想状況</h2>

          <div className="text-center font-bold mb-4">
            予想者総数：{predictionStats.total} 名
          </div>

          {[
            { key: "bakuado", label: "爆アド", color: "bg-red-400" },
            { key: "nibuni", label: "ニブニ", color: "bg-blue-400" },
            { key: "nibuichi", label: "ニブイチ", color: "bg-green-400" },
            { key: "nibuzero", label: "ニブゼロ", color: "bg-gray-400" },
          ].map((item) => {
            const count = predictionStats[item.key];
            const percent =
              predictionStats.total > 0
                ? Math.round((count / predictionStats.total) * 100)
                : 0;

            return (
              <div key={item.key} className="mb-3">
                <div className="flex justify-between text-sm font-bold mb-1">
                  <span className="w-20">{item.label}</span>
                  <span>{count} 名（{percent}%）</span>
                </div>

                <div className="w-full bg-gray-200 h-3 rounded overflow-hidden">
                  <div
                    className={`${item.color} h-3`}
                    style={{ width: `${percent}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 今日の予想 */}
      <div className="bg-white shadow p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-3">今日の予想</h2>

        {isFixed && (
          <div className="text-center text-red-600 font-bold mb-3">
            本日の結果はすでに確定済みです
          </div>
        )}

        {todayPrediction?.prediction && (
          <div className="text-center text-green-600 font-bold mb-3">
            あなたの予想：{todayPrediction.prediction}
          </div>
        )}

        {!isFixed && !todayPrediction?.prediction && selected && (
          <div className="text-center text-blue-600 font-bold mb-3">
            選択中：{selected}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {options.map((opt) => (
            <button
              key={opt.key}
              disabled={isFixed || todayPrediction?.prediction}
              onClick={() => setSelected(opt.key)}
              className={`border rounded-lg overflow-hidden shadow ${
                selected === opt.key ? "ring-4 ring-blue-400" : ""
              } ${
                isFixed || todayPrediction?.prediction
                  ? "opacity-60 cursor-not-allowed"
                  : ""
              }`}
            >
              <Image
                src={opt.img}
                alt={opt.label}
                width={300}
                height={300}
                className="w-full"
              />
              <div className="text-center py-1 text-sm font-bold">
                {opt.label}
              </div>
            </button>
          ))}
        </div>

        {!isFixed && !todayPrediction?.prediction && (
          <div className="mt-4 text-center">
            <button
              disabled={!selected || sending}
              onClick={sendPrediction}
              className={`px-4 py-2 rounded-lg text-white font-bold ${
                selected
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-gray-400 cursor-not-allowed"
              }`}
            >
              {selected ? "この予想で確定する" : "予想を選択してください"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
