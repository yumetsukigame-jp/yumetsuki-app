"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { auth, functions } from "../../firebase";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";

export default function NibuichiPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState<any>(null); // 個人戦績
  const [todayPrediction, setTodayPrediction] = useState<any>(null); // 今日の予想
  const [globalStats, setGlobalStats] = useState<any>(null); // ゆめつき戦績

  const [selected, setSelected] = useState<string | null>(null); // 選択中
  const [sending, setSending] = useState(false);

  // -----------------------------
  // ログイン監視
  // -----------------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        fetchStats();
      } else {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // -----------------------------
  // 戦績・今日の予想取得
  // -----------------------------
  const fetchStats = async () => {
    setLoading(true);
    try {
      const fn = httpsCallable(functions, "getNibuichiUserStats");
      const res: any = await fn({});

      setStats(res.data.stats ?? null);
      setTodayPrediction(res.data.todayPrediction ?? null);
      setGlobalStats(res.data.global ?? null);

      // 予想済みなら選択状態に反映
      if (res.data.todayPrediction?.prediction) {
        setSelected(res.data.todayPrediction.prediction);
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
    if (!user) return;
    if (!selected) return;

    // すでに確定済みなら何もしない
    if (todayPrediction?.fixed || todayPrediction?.prediction) return;

    setSending(true);
    try {
      const fn = httpsCallable(functions, "saveNibuichiPrediction");
      await fn({ prediction: selected });

      // 🔥 Firestore の最新状態を再取得して UI 更新
      await fetchStats();
    } catch (err) {
      console.error(err);
    }
    setSending(false);
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-600">
        読み込み中…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 text-center text-gray-600">
        ログインしてください
      </div>
    );
  }

  // -----------------------------
  // 選択肢
  // -----------------------------
  const options = [
    { key: "bakuado", label: "爆アド", img: "/nibuichi/bakuado.webp" },
    { key: "nibuni", label: "ニブニ", img: "/nibuichi/nibuni.webp" },
    { key: "nibuichi", label: "ニブイチ", img: "/nibuichi/nibuichi.webp" },
    { key: "nibuzero", label: "ニブゼロ", img: "/nibuichi/nibuzero.webp" },
  ];

  // -----------------------------
  // 確定済み判定（fixed が無くても prediction があれば確定扱い）
  // -----------------------------
  const isFixed = todayPrediction?.fixed || todayPrediction?.prediction;

  return (
    <div className="max-w-md mx-auto p-4 space-y-6">

      {/* トップ画像 */}
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

      {/* 今日の予想 */}
      <div className="bg-white shadow p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-3">今日の予想</h2>

        {/* 選択中の表示 */}
        {!isFixed && selected && (
          <div className="text-center text-blue-600 font-bold mb-3">
            選択中：{selected}
          </div>
        )}

        {/* 確定済みの表示 */}
        {isFixed && (
          <div className="text-center text-green-600 font-bold mb-3">
            本日は選択済みです：{todayPrediction?.prediction}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {options.map((opt) => (
            <button
              key={opt.key}
              disabled={isFixed}
              onClick={() => setSelected(opt.key)}
              className={`border rounded-lg overflow-hidden shadow ${
                selected === opt.key ? "ring-4 ring-blue-400" : ""
              } ${isFixed ? "opacity-60 cursor-not-allowed" : ""}`}
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

        {/* 予想確定ボタン */}
        {!isFixed && (
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
