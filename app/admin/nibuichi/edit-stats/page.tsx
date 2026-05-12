"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Firebase
import { auth, functions, db } from "../../../../firebase";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function EditNibuichiStatsPage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [win, setWin] = useState<number>(0);
  const [draw, setDraw] = useState<number>(0);
  const [lose, setLose] = useState<number>(0);
  const [bakuado, setBakuado] = useState<number>(0);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

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
  // 現在の総合戦績を取得
  // -----------------------------
  const fetchStats = async () => {
    try {
      const ref = doc(db, "nibuichi_global_stats", "stats");
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data();
        setWin(data.win ?? 0);
        setDraw(data.draw ?? 0);
        setLose(data.lose ?? 0);
        setBakuado(data.bakuado ?? 0);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // -----------------------------
  // 保存処理
  // -----------------------------
  const saveStats = async () => {
    setSaving(true);
    setMessage("");

    try {
      const fn = httpsCallable(functions, "editNibuichiGlobalStats");
      await fn({
        win,
        draw,
        lose,
        bakuado,
      });

      setMessage("保存しました！");
    } catch (err) {
      console.error(err);
      setMessage("保存に失敗しました");
    }

    setSaving(false);
  };

  if (loading) {
    return <div className="p-6 text-center">読み込み中…</div>;
  }

  if (!user) {
    return <div className="p-6 text-center">管理者のみアクセスできます</div>;
  }

  return (
    <div className="max-w-md mx-auto p-4 space-y-6">

      <h1 className="text-xl font-bold text-center">総合戦績の修正</h1>

      <div className="bg-white shadow p-4 rounded-lg space-y-4">

        <div>
          <label className="font-bold">勝（ニブニ）</label>
          <input
            type="number"
            value={win}
            onChange={(e) => setWin(Number(e.target.value))}
            className="border p-2 rounded w-full mt-1"
          />
        </div>

        <div>
          <label className="font-bold">分（ニブイチ）</label>
          <input
            type="number"
            value={draw}
            onChange={(e) => setDraw(Number(e.target.value))}
            className="border p-2 rounded w-full mt-1"
          />
        </div>

        <div>
          <label className="font-bold">敗（ニブゼロ）</label>
          <input
            type="number"
            value={lose}
            onChange={(e) => setLose(Number(e.target.value))}
            className="border p-2 rounded w-full mt-1"
          />
        </div>

        <div>
          <label className="font-bold">爆アド</label>
          <input
            type="number"
            value={bakuado}
            onChange={(e) => setBakuado(Number(e.target.value))}
            className="border p-2 rounded w-full mt-1"
          />
        </div>

        {/* 保存ボタン */}
        <div className="text-center">
          <button
            onClick={saveStats}
            disabled={saving}
            className={`px-4 py-2 rounded-lg text-white font-bold ${
              saving ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            保存する
          </button>
        </div>

        {/* メッセージ */}
        {message && (
          <div className="text-center text-green-600 font-bold">{message}</div>
        )}
      </div>

      {/* 戻る */}
      <div className="text-center">
        <button
          onClick={() => router.push("/admin/nibuichi")}
          className="px-4 py-2 bg-gray-300 rounded"
        >
          戻る
        </button>
      </div>
    </div>
  );
}
