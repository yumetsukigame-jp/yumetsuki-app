"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { auth, functions, db } from "../../../firebase";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

/* --------------------------------------------------
   ★ 今日の日付（6時切り替え）
-------------------------------------------------- */
function getTodayJST6() {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );
  if (now.getHours() < 6) {
    now.setDate(now.getDate() - 1);
  }
  return now.toISOString().slice(0, 10);
}

export default function AdminNibuichiPage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [globalStats, setGlobalStats] = useState<any>(null);
  const [todayResult, setTodayResult] = useState<any>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [rewardPoints, setRewardPoints] = useState<number>(500);
  const [sending, setSending] = useState(false);

  const [editMode, setEditMode] = useState(false);

  const [predictionStats, setPredictionStats] = useState<any>(null);

  /* --------------------------------------------------
     管理者判定
  -------------------------------------------------- */
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

  /* --------------------------------------------------
     今日の予想者数を取得（棒グラフ用）
  -------------------------------------------------- */
  const fetchTodayPredictions = async (targetDate: string) => {
    const q = query(
      collection(db, "nibuichi_user_predictions"),
      where("date", "==", targetDate)
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

  /* --------------------------------------------------
     戦績 & 今日の結果取得（修正版）
  -------------------------------------------------- */
  const fetchStats = async () => {
    setLoading(true);

    try {
      const fn = httpsCallable(functions, "getNibuichiUserStats");
      const res: any = await fn({});

      setGlobalStats(res.data.global ?? null);

      // ★ 今日の結果（サーバー側 JST6 ロジック）
      const tr = res.data.todayResult ?? null;
      setTodayResult(tr);

      setSelected(tr?.result ?? null);
      setRewardPoints(tr?.rewardPoints ?? 500);

      // ★ 修正ポイント：サーバー側の日付を優先
      const targetDate = tr?.date ?? getTodayJST6();
      await fetchTodayPredictions(targetDate);

      setEditMode(false);
    } catch (err) {
      console.error(err);
    }

    setLoading(false);
  };

  /* --------------------------------------------------
     今日の結果を確定 or 修正
  -------------------------------------------------- */
  const submitResult = async () => {
    if (!selected) return;

    setSending(true);
    try {
      const today = getTodayJST6();

      // ① 今日の結果を保存
      const fn = httpsCallable(functions, "submitNibuichiResult");
      await fn({ result: selected, rewardPoints });

      // ② 総合戦績を取得
      const statsRef = doc(db, "nibuichi_global_stats", "stats");
      const statsSnap = await getDoc(statsRef);
      const stats = statsSnap.exists
        ? statsSnap.data()
        : { win: 0, draw: 0, lose: 0, bakuado: 0 };

      // ③ 前回の結果を減算
      if (todayResult?.result) {
        if (todayResult.result === "nibuni") stats.win--;
        if (todayResult.result === "nibuichi") stats.draw--;
        if (todayResult.result === "nibuzero") stats.lose--;
        if (todayResult.result === "bakuado") stats.bakuado--;
      }

      // ④ 今回の結果を加算
      if (selected === "nibuni") stats.win++;
      if (selected === "nibuichi") stats.draw++;
      if (selected === "nibuzero") stats.lose++;
      if (selected === "bakuado") stats.bakuado++;

      // ⑤ Firestore に保存
      await setDoc(statsRef, stats, { merge: true });

      await new Promise((resolve) => setTimeout(resolve, 400));

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

  /* --------------------------------------------------
     ★ 正しい確定判定
  -------------------------------------------------- */
  const isFixed = todayResult?.processed === true;

  const options = [
    { key: "bakuado", label: "爆アド", img: "/nibuichi/bakuado.webp" },
    { key: "nibuni", label: "ニブニ", img: "/nibuichi/nibuni.webp" },
    { key: "nibuichi", label: "ニブイチ", img: "/nibuichi/nibuichi.webp" },
    { key: "nibuzero", label: "ニブゼロ", img: "/nibuichi/nibuzero.webp" },
  ];

  const totalBattle =
    (globalStats?.win ?? 0) +
    (globalStats?.draw ?? 0) +
    (globalStats?.lose ?? 0) +
    (globalStats?.bakuado ?? 0);

  return (
    <div className="max-w-md mx-auto p-4 space-y-6">

      <h1 className="text-xl font-bold text-center">ニブイチ管理画面</h1>

      {/* ゆめつき戦績 */}
      <div className="bg-white shadow p-4 rounded-lg text-center">
        <h2 className="text-lg font-bold mb-2">ゆめつきの戦績</h2>

        <div className="text-xl font-bold mb-1">
          【現戦績】{totalBattle}戦
        </div>

        <div className="text-xl font-bold">
          {globalStats?.win ?? 0}勝/
          {globalStats?.draw ?? 0}分/
          {globalStats?.lose ?? 0}負/
          {globalStats?.bakuado ?? 0}爆アド
        </div>
      </div>

      {/* 今日の予想状況（棒グラフ） */}
      {predictionStats && (
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

      {/* 今日の結果入力 */}
      <div className="bg-white shadow p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-3">今日の結果を入力</h2>

        {!isFixed && selected && (
          <div className="text-center text-blue-600 font-bold mb-3">
            選択中：{selected}
          </div>
        )}

        {isFixed && !editMode && (
          <div className="text-center text-green-600 font-bold mb-3">
            本日は確定済み：{todayResult?.result}
          </div>
        )}

        {editMode && (
          <div className="text-center text-orange-600 font-bold mb-3">
            修正モード：{selected}
          </div>
        )}

        {/* 配布ポイント */}
        <div className="mt-4">
          <label className="font-bold">今日の配布ポイント：</label>
          <input
            type="number"
            value={rewardPoints}
            onChange={(e) => setRewardPoints(Number(e.target.value))}
            className="border p-2 rounded w-full mt-1"
            disabled={isFixed && !editMode}
          />
        </div>

        {/* 選択肢 */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          {options.map((opt) => (
            <button
              key={opt.key}
              disabled={isFixed && !editMode}
              onClick={() => setSelected(opt.key)}
              className={`border rounded-lg overflow-hidden shadow ${
                selected === opt.key ? "ring-4 ring-red-400" : ""
              } ${(isFixed && !editMode) ? "opacity-60 cursor-not-allowed" : ""}`}
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

        {/* ボタン */}
        <div className="mt-4 text-center">

          {isFixed && !editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="px-4 py-2 rounded-lg text-white font-bold bg-blue-600 hover:bg-blue-700"
            >
              結果を修正する
            </button>
          )}

          {editMode && (
            <button
              disabled={!selected || sending}
              onClick={submitResult}
              className={`px-4 py-2 rounded-lg text-white font-bold ${
                !selected
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-orange-600 hover:bg-orange-700"
              }`}
            >
              修正を確定する
            </button>
          )}

          {!isFixed && (
            <button
              disabled={!selected || sending}
              onClick={submitResult}
              className={`px-4 py-2 rounded-lg text-white font-bold ${
                !selected
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              この結果で確定する
            </button>
          )}
        </div>
      </div>

      {/* 総合戦績修正 */}
      <div className="bg-gray-100 p-4 rounded-lg text-center">
        <h3 className="font-bold mb-2">総合戦績の修正</h3>
        <button
          onClick={() => router.push("/admin/nibuichi/edit-stats")}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          総合戦績を修正する
        </button>
      </div>
    </div>
  );
}
