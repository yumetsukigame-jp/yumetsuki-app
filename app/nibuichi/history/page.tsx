"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";

export default function NibuichiHistoryPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [history, setHistory] = useState<any[]>([]);
  const [pointHistory, setPointHistory] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setLoading(false);
        return;
      }

      setUser(u);

      await fetchHistory(u.uid);
      await fetchPointHistory(u.uid);

      setLoading(false);
    });

    return () => unsub();
  }, []);

  /* ============================================================
     ニブイチ履歴取得（新仕様：nibuichi_daily を読む）
  ============================================================ */
  const fetchHistory = async (uid: string) => {
    try {
      const dailyCol = collection(db, "nibuichi_daily");
      const dailySnap = await getDocs(dailyCol);

      const list: any[] = [];

      for (const dayDoc of dailySnap.docs) {
        const date = dayDoc.id;

        // 各日の predictions/{uid} を読む
        const predRef = doc(db, "nibuichi_daily", date, "predictions", uid);
        const predSnap = await getDoc(predRef);

        if (!predSnap.exists()) continue; // その日は予想していない

        const data = predSnap.data();

        list.push({
          date,
          prediction: data.prediction,
          result: data.result,
          hit: data.prediction === data.result,
        });
      }

      // 日付降順に並べる
      list.sort((a, b) => (a.date < b.date ? 1 : -1));

      setHistory(list);
    } catch (err) {
      console.error("fetchHistory error:", err);
      setHistory([]);
    }
  };

  /* ============================================================
     ニブイチ獲得ポイント履歴（そのままでOK）
  ============================================================ */
  const fetchPointHistory = async (uid: string) => {
    try {
      const col = collection(db, "pointHistory");
      const q = query(
        col,
        where("user", "==", uid),
        where("type", "==", "nibuichi"),
        orderBy("createdAt", "desc")
      );

      const snap = await getDocs(q);

      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setPointHistory(list);
    } catch (err) {
      console.error("fetchPointHistory error:", err);
      setPointHistory([]);
    }
  };

  if (loading) {
    return <div className="p-6 text-center">読み込み中…</div>;
  }

  if (!user) {
    return <div className="p-6 text-center">ログインしてください</div>;
  }

  return (
    <div className="max-w-md mx-auto p-4 space-y-6">

      <h1 className="text-xl font-bold text-center mb-4">ニブイチ履歴</h1>

      {/* -----------------------------
          ニブイチ履歴一覧
      ----------------------------- */}
      <div className="bg-white shadow p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-3">予想履歴</h2>

        {history.length === 0 && (
          <p className="text-gray-600">まだ履歴がありません。</p>
        )}

        <div className="space-y-3">
          {history.map((item, i) => (
            <div key={i} className="border p-3 rounded-lg bg-gray-50">
              <div className="font-bold">{item.date}</div>
              <div>予想：{item.prediction}</div>
              <div>結果：{item.result ?? "未確定"}</div>

              {item.result && (
                <div className={item.hit ? "text-green-600" : "text-red-600"}>
                  {item.hit ? "的中！" : "ハズレ"}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* -----------------------------
          ニブイチで獲得したポイント履歴
      ----------------------------- */}
      <div className="bg-white shadow p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-3">獲得ポイント履歴</h2>

        {pointHistory.length === 0 && (
          <p className="text-gray-600">まだポイント履歴がありません。</p>
        )}

        <div className="space-y-3">
          {pointHistory.map((item) => (
            <div key={item.id} className="border p-3 rounded-lg bg-gray-50">
              <div className="font-bold">
                {item.createdAt?.toDate
                  ? item.createdAt.toDate().toLocaleString()
                  : ""}
              </div>
              <div>獲得ポイント：{item.added} pt</div>
              <div>理由：ニブイチ（{item.prediction}）</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
