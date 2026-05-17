"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { db, functions, auth } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function GachaDetailPage() {
  const { code } = useParams();
  const router = useRouter();

  const [gacha, setGacha] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(true);
  const [error, setError] = useState("");

  const [allResults, setAllResults] = useState<any[]>([]);
  const currentUid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    load();
  }, []);

  // ★ displayName + Xアカウント取得
  const getUserInfo = async (uid: string) => {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return "名無し";

    const u = snap.data();
    return u.displayName || u.xAccount || "名無し";
  };

  const load = async () => {
    setLoading(true);

    const snap = await getDoc(doc(db, "gachaCodes", code as string));

    if (!snap.exists()) {
      setError("ガチャが存在しません");
      setLoading(false);
      return;
    }

    const data = snap.data();
    const flags: string[] = data.publicFlags ?? [];

    /* --------------------------------------------------
       ★ publicFlags によるアクセス制御
    -------------------------------------------------- */

    const isPublic = flags.includes("public");
    const isLimited = flags.includes("limited");
    const isSubscriberOnly = flags.includes("subscriber");
    const isWinnerOnly = flags.includes("nibuichi_winner");

    // ★ 公開でない場合はログイン必須
    if (!isPublic && !currentUid) {
      setError("このガチャは限定公開です");
      setLoading(false);
      return;
    }

    // 🔒 limited → 過去に引いた人だけ
    if (isLimited) {
      const historyRef = doc(db, "userGachaHistory", `${currentUid}_${code}`);
      const historySnap = await getDoc(historyRef);

      if (!historySnap.exists()) {
        setError("このガチャは限定公開です");
        setLoading(false);
        return;
      }
    }

    // ⭐ subscriber → サブスク会員のみ
    if (isSubscriberOnly) {
      const userSnap = await getDoc(doc(db, "users", currentUid!));
      const user = userSnap.data();

      // ★ 修正：Firestore の構造に合わせて subscriber を参照
      if (!user?.subscriber) {
        setError("このガチャはサブスク会員限定です");
        setLoading(false);
        return;
      }
    }

    // 🎯 nibuichi_winner → 前日のニブイチ的中者のみ
    if (isWinnerOnly) {
      const winnerSnap = await getDoc(doc(db, "nibuichiWinners", currentUid!));
      if (!winnerSnap.exists()) {
        setError("このガチャは前日のニブイチ的中者限定です(※更新は朝6:05)");
        setLoading(false);
        return;
      }
    }

    // ★ アクセスOK
    setGacha(data);
    setLoading(false);

    /* --------------------------------------------------
       ★ このガチャの結果を取得
    -------------------------------------------------- */
    setResultsLoading(true);

    const fn = httpsCallable(functions, "getGachaResults");
    const res: any = await fn();
    const list = res.data.filter((r: any) => r.code === code);

    setAllResults(list);
    setResultsLoading(false);
  };

  const play = () => {
    router.push(`/gacha?code=${code}`);
  };

  if (loading) return <p style={{ padding: 24 }}>読み込み中…</p>;
  if (error) return <p style={{ padding: 24, color: "red" }}>{error}</p>;
  if (!gacha) return null;

  const remaining =
    gacha.mode === "count"
      ? gacha.totalCount - allResults.length
      : "∞";

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 10 }}>{gacha.title}</h1>

      <p>コード：{gacha.code}</p>
      <p>方式：{gacha.mode === "count" ? "枠数方式" : "確率方式"}</p>
      <p>
        1回 {gacha.point.cost} pt（上限 {gacha.point.maxPerUser} 回）
      </p>
      <p>残数：{remaining}</p>
      <p>
        締切：
        {gacha.expiresAt
          ? gacha.expiresAt.toDate().toLocaleString()
          : "なし"}
      </p>

      <button
        onClick={play}
        style={{
          marginTop: 20,
          padding: "12px 20px",
          background: "#2563eb",
          color: "white",
          borderRadius: 8,
          border: "none",
          fontSize: 18,
          cursor: "pointer",
        }}
      >
        ガチャを引く（演出あり）
      </button>

      <h2 style={{ marginTop: 32 }}>📜 このガチャの当選状況</h2>

      {resultsLoading ? (
        <p>当選状況を読み込み中…</p>
      ) : (
        <SimpleFrameList
          frames={gacha.frames}
          mode={gacha.mode}
          results={allResults}
          currentUid={currentUid}
          getUserInfo={getUserInfo}
        />
      )}

      <button
        onClick={() => router.push(`/gacha/results?code=${code}`)}
        style={{
          marginTop: 30,
          padding: "12px 20px",
          background: "#4f46e5",
          color: "white",
          borderRadius: 8,
          border: "none",
          cursor: "pointer",
          width: "100%",
          fontSize: 16,
        }}
      >
        このガチャの結果一覧ページへ
      </button>

      <button
        onClick={() => router.push(`/gacha/results`)}
        style={{
          marginTop: 12,
          padding: "12px 20px",
          background: "#6b7280",
          color: "white",
          borderRadius: 8,
          border: "none",
          cursor: "pointer",
          width: "100%",
          fontSize: 16,
        }}
      >
        他のガチャの結果一覧へ
      </button>
    </div>
  );
}

/* ------------------------------------------
   ★ 簡易版 FrameList
------------------------------------------ */
function SimpleFrameList({ frames, mode, results, currentUid, getUserInfo }: any) {
  return (
    <div style={{ marginTop: 16 }}>
      {frames.map((f: any) => {
        const frameName = f.label;
        const list = results.filter((r: any) => r.frameName === frameName);

        return (
          <div key={frameName} style={{ marginBottom: 20 }}>
            <h3>
              {frameName}{" "}
              {mode === "count"
                ? `（${list.length}/${f.maxCount}）`
                : `（${Math.round(f.probability * 100)}%）`}
            </h3>

            {list.length === 0 ? (
              <p style={{ marginLeft: 20 }}>当選者なし</p>
            ) : (
              <ul style={{ paddingLeft: 20 }}>
                {list.map((r: any) => (
                  <UserNameItem
                    key={r.id}
                    result={r}
                    currentUid={currentUid}
                    getUserInfo={getUserInfo}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------
   ★ 名前表示
------------------------------------------ */
function UserNameItem({ result, currentUid, getUserInfo }: any) {
  const [name, setName] = useState("読み込み中…");

  useEffect(() => {
    (async () => {
      const n = await getUserInfo(result.uid);
      setName(n);
    })();
  }, []);

  return (
    <li
      style={{
        marginBottom: 4,
        fontWeight: currentUid === result.uid ? "bold" : "normal",
        color: currentUid === result.uid ? "#2563eb" : "black",
      }}
    >
      {name}：{result.reward} pt
      {currentUid === result.uid && " ← あなた"}
    </li>
  );
}
