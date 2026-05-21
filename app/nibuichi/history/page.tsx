"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  getDoc,
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
     ★ 修正版：予想はアーカイブ + 当日分の両方から取得
  ============================================================ */
  const fetchHistory = async (uid: string) => {
    try {
      const list: any[] = [];

      /* -----------------------------
         ① 過去の予想（アーカイブ）
      ----------------------------- */
      const arcCol = collection(db, "nibuichi_user_predictions_archive");
      const qArc = query(arcCol, where("uid", "==", uid));
      const arcSnap = await getDocs(qArc);

      for (const docSnap of arcSnap.docs) {
        const data = docSnap.data();
        await pushHistoryItem(list, data, uid);
      }

      /* -----------------------------
         ② 今日の予想（まだアーカイブされていない）
      ----------------------------- */
      const predCol = collection(db, "nibuichi_user_predictions");
      const qPred = query(predCol, where("uid", "==", uid));
      const predSnap = await getDocs(qPred);

      for (const docSnap of predSnap.docs) {
        const data = docSnap.data();
        await pushHistoryItem(list, data, uid);
      }

      /* -----------------------------
         日付降順にソート
      ----------------------------- */
      list.sort((a, b) => (a.date < b.date ? 1 : -1));

      setHistory(list);
    } catch (err) {
      console.error("fetchHistory error:", err);
      setHistory([]);
    }
  };

  /* ============================================================
     ★ 予想1件分の情報をまとめて history に push する関数
     ★ dailyExists を追加して「未反映」を判定可能にする
  ============================================================ */
  const pushHistoryItem = async (list: any[], data: any, uid: string) => {
    const date = data.date;

    /* 結果 */
    const resultRef = doc(db, "nibuichi_global", date);
    const resultSnap = await getDoc(resultRef);
    const resultData = resultSnap.exists() ? resultSnap.data() : null;

    /* 山分けポイント（daily） */
    let perUserReward = 0;
    let dailyExists = false;

    const dailyRef = collection(db, "nibuichi_daily", date, "predictions");
    const dailySnap = await getDocs(dailyRef);

    if (!dailySnap.empty) {
      dailyExists = true;
    }

    dailySnap.forEach((d) => {
      const h = d.data();
      if (h.uid === uid) {
        const raw = h.perUserReward;
        perUserReward =
          typeof raw === "number" && !Number.isNaN(raw) ? raw : 0;
      }
    });

    list.push({
      date,
      prediction: data.prediction,
      result: resultData?.result ?? null,
      perUserReward,
      dailyExists,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
    });
  };

  /* ============================================================
     ニブイチ獲得ポイント履歴（pointHistory）
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
          {history.map((item, i) => {
            const reward =
              item.prediction === item.result
                ? item.perUserReward ?? 0
                : 0;

            return (
              <div key={i} className="border p-3 rounded-lg bg-gray-50">
                <div className="font-bold">{item.date}</div>

                <div>予想：{item.prediction}</div>
                <div>結果：{item.result ?? "未確定"}</div>

                {/* -----------------------------
                    ★ ポイント表示ロジック（修正版）
                ----------------------------- */}
                <div>
                  獲得ポイント：

                  {item.result && item.dailyExists === false ? (
                    <span className="text-orange-600">
                      （ポイント反映は6:05頃に行われます）
                    </span>
                  ) : (
                    <span
                      className={
                        reward > 0 ? "text-green-600" : "text-gray-600"
                      }
                    >
                      {reward} pt
                    </span>
                  )}
                </div>

                {/* 的中判定 */}
                {item.result && (
                  <div
                    className={
                      item.prediction === item.result
                        ? "text-green-600"
                        : "text-red-600"
                    }
                  >
                    {item.prediction === item.result ? "的中！" : "ハズレ"}
                  </div>
                )}
              </div>
            );
          })}
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
