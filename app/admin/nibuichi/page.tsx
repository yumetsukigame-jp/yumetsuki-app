"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

// Firebase 初期化済み
import { auth, functions, db } from "../../../firebase";

import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function AdminNibuichiPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [globalStats, setGlobalStats] = useState<any>(null);
  const [todayResult, setTodayResult] = useState<any>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // -----------------------------
  // Firestore admins コレクションで管理者判定
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
      fetchStats();
    });

    return () => unsub();
  }, []);

  // -----------------------------
  // 戦績 & 今日の結果取得
  // -----------------------------
  const fetchStats = async () => {
    setLoading(true);
    try {
      const fn = httpsCallable(functions, "getNibuichiUserStats");
      const res: any = await fn({});

      setGlobalStats(res.data.global ?? null);

      if (res.data.global?.todayResult) {
        setTodayResult(res.data.global.todayResult);
        setSelected(res.data.global.todayResult);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // -----------------------------
  // 今日の結果を確定
  // -----------------------------
  const submitResult = async () => {
    if (!selected) return;

    setSending(true);
    try {
      const fn = httpsCallable(functions, "submitNibuichiResult");
      await fn({ result: selected });
      await fetchStats();
    } catch (err) {
      console.error(err);
    }
    setSending(false);
  };

  if (loading) {
    return <div className="p-6 text-center">読み込み中…</div>;
  }

  if (!user) {
    return <div className="p-6 text-center">管理者のみアクセスできます</div>;
  }

  // -----------------------------
  // 画像ボタン
  // -----------------------------
  const options = [
    { key: "bakuado", label: "爆アド", img: "/nibuichi/bakuado.webp" },
    { key: "nibuni", label: "ニブニ", img: "/nibuichi/nibuni.webp" },
    { key: "nibuichi", label: "ニブイチ", img: "/nibuichi/nibuichi.webp" },
    { key: "nibuzero", label: "ニブゼロ", img: "/nibuichi/nibuzero.webp" },
  ];

  return (
    <div className="max-w-md mx-auto p-4 space-y-6">

      <h1 className="text-xl font-bold text-center">ニブイチ管理画面</h1>

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

      {/* 今日の結果 */}
      <div className="bg-white shadow p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-3">今日の結果を入力</h2>

        {todayResult && (
          <div className="text-center text-blue-600 font-bold mb-3">
            今日の結果は確定済み：{todayResult}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {options.map((opt) => (
            <button
              key={opt.key}
              disabled={!!todayResult}
              onClick={() => setSelected(opt.key)}
              className={`border rounded-lg overflow-hidden shadow ${
                selected === opt.key ? "ring-4 ring-red-400" : ""
              } ${todayResult ? "opacity-60" : ""}`}
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

        {!todayResult && (
          <div className="mt-4 text-center">
            <button
              disabled={!selected || sending}
              onClick={submitResult}
              className={`px-4 py-2 rounded-lg text-white font-bold ${
                selected
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-gray-400 cursor-not-allowed"
              }`}
            >
              今日の結果を確定する
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
