"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { auth, functions } from "../../firebase";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";

export default function NibuichiPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState<any>(null);
  const [todayPrediction, setTodayPrediction] = useState<any>(null);
  const [globalStats, setGlobalStats] = useState<any>(null);

  const [todayResult, setTodayResult] = useState<any>(null); // 今日の結果

  const [selected, setSelected] = useState<string | null>(null);
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
      setTodayResult(res.data.todayResult ?? null);

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

    // ★ 結果確定済みなら絶対に送信させない
    if (todayResult?.processed === true) return;

    // ★ すでに予想済みなら送信させない
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

  const options = [
    { key: "bakuado", label: "爆アド", img: "/nibuichi/bakuado.webp" },
    { key: "nibuni", label: "ニブニ", img: "/nibuichi/nibuni.webp" },
    { key: "nibuichi", label: "ニブイチ", img: "/nibuichi/nibuichi.webp" },
    { key: "nibuzero", label: "ニブゼロ", img: "/nibuichi/nibuzero.webp" },
  ];

  // -----------------------------
  // ★ 結果確定フェーズ判定（最優先）
  // -----------------------------
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

      {/* 今日の予想 */}
      <div className="bg-white shadow p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-3">今日の予想</h2>

        {/* ★ 結果確定フェーズ（最優先表示） */}
        {isFixed && (
          <>
            <div className="text-center text-red-600 font-bold mb-3">
              本日の結果はすでに確定済みです
            </div>

            {todayPrediction?.prediction && (
              <div className="text-center text-green-600 font-bold mb-3">
                あなたの予想：{todayPrediction.prediction}
              </div>
            )}
          </>
        )}

        {/* ★ 未確定フェーズ */}
        {!isFixed && selected && (
          <div className="text-center text-blue-600 font-bold mb-3">
            選択中：{selected}
          </div>
        )}

        {!isFixed && todayPrediction?.prediction && (
          <div className="text-center text-green-600 font-bold mb-3">
            本日は選択済みです：{todayPrediction.prediction}
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

        {/* ★ 送信ボタン（未確定時のみ） */}
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
