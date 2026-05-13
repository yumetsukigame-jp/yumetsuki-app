"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { auth, functions, db } from "../../../firebase";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function AdminNibuichiPage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [globalStats, setGlobalStats] = useState<any>(null);
  const [todayResult, setTodayResult] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [rewardPoints, setRewardPoints] = useState<number>(500);
  const [sending, setSending] = useState(false);

  const [editMode, setEditMode] = useState(false); // ★ 修正モード追加

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

      if (res.data.todayResult) {
        setTodayResult(res.data.todayResult.result);
        setSelected(res.data.todayResult.result);
      } else {
        setTodayResult(null);
        setSelected(null);
      }

      setEditMode(false); // ★ 修正モード解除
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // -----------------------------
  // 今日の結果を確定 or 修正
  // -----------------------------
  const submitResult = async () => {
    if (!selected) return;

    setSending(true);
    try {
      const fn = httpsCallable(functions, "submitNibuichiResult");
      await fn({ result: selected, rewardPoints });

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
  // 確定済み判定
  // -----------------------------
  const isFixed = todayResult != null;

  // -----------------------------
  // 選択肢
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

        {/* 選択中の表示 */}
        {!isFixed && selected && (
          <div className="text-center text-blue-600 font-bold mb-3">
            選択中：{selected}
          </div>
        )}

        {/* 確定済みの表示 */}
        {isFixed && !editMode && (
          <div className="text-center text-green-600 font-bold mb-3">
            本日は確定済み：{todayResult}
          </div>
        )}

        {/* 修正モード中の表示 */}
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

          {/* 修正モードでない & 確定済み → 修正ボタン */}
          {isFixed && !editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="px-4 py-2 rounded-lg text-white font-bold bg-blue-600 hover:bg-blue-700"
            >
              結果を修正する
            </button>
          )}

          {/* 修正モード中 → 修正を確定する */}
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

          {/* 未確定 → 通常の確定ボタン */}
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
