"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { auth, functions, db } from "../../../firebase";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

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
  const [todayResult, setTodayResult] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [rewardPoints, setRewardPoints] = useState<number>(500);
  const [sending, setSending] = useState(false);

  const [editMode, setEditMode] = useState(false);

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
     今日の結果を Firestore から取得（6時切り替え）
  -------------------------------------------------- */
  const fetchTodayResult = async () => {
    const today = getTodayJST6();
    const ref = doc(db, "nibuichi_global", today);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data();
      setTodayResult(data.result ?? null);
      setSelected(data.result ?? null);
      setRewardPoints(data.rewardPoints ?? 500);
    } else {
      setTodayResult(null);
      setSelected(null);
    }
  };

  /* --------------------------------------------------
     戦績 & 今日の結果取得
  -------------------------------------------------- */
  const fetchStats = async () => {
    setLoading(true);

    try {
      const fn = httpsCallable(functions, "getNibuichiUserStats");
      const res: any = await fn({});
      setGlobalStats(res.data.global ?? null);

      await fetchTodayResult();
      setEditMode(false);
    } catch (err) {
      console.error(err);
    }

    setLoading(false);
  };

  /* --------------------------------------------------
     今日の結果を確定 or 修正（＋総合戦績も更新）
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
      if (todayResult) {
        if (todayResult === "nibuni") stats.win--;
        if (todayResult === "nibuichi") stats.draw--;
        if (todayResult === "nibuzero") stats.lose--;
        if (todayResult === "bakuado") stats.bakuado--;
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

  const isFixed = todayResult != null;

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

      {/* 今日の結果 */}
      <div className="bg-white shadow p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-3">今日の結果を入力</h2>

        {!isFixed && selected && (
          <div className="text-center text-blue-600 font-bold mb-3">
            選択中：{selected}
          </div>
        )}

        {isFixed && !editMode && (
          <div className="text-center text-green-600 font-bold mb-3">
            本日は確定済み：{todayResult}
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
