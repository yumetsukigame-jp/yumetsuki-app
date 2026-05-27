"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db, auth } from "@/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";

/* --------------------------------------------------
   Timestamp → Date 安全変換
-------------------------------------------------- */
function toDateSafe(ts: any) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts._seconds) return new Date(ts._seconds * 1000);
  return null;
}

/* --------------------------------------------------
   ユーザー名取得（キャッシュ付き・@正規化対応）
-------------------------------------------------- */
const userCache: Record<string, string> = {};

async function getUserInfo(uid: string) {
  if (userCache[uid]) return userCache[uid];

  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) {
    userCache[uid] = "名無し";
    return "名無し";
  }

  const u = snap.data();
  const display = u.displayName || "名無し";

  const rawX = u.xAccount || "";
  const normalizedX = rawX.replace(/^@+/, "");
  const x = normalizedX ? `（@${normalizedX}）` : "";

  const finalName = `${display}${x}`;
  userCache[uid] = finalName;
  return finalName;
}

/* --------------------------------------------------
   JST6時基準の「昨日」を Functions と完全一致で算出
-------------------------------------------------- */
function getPrevDayJST6() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  // JST6時の境界
  const cutoff = new Date(jst);
  cutoff.setHours(6, 0, 0, 0);

  // 6時前なら「昨日扱い」
  if (jst < cutoff) {
    jst.setDate(jst.getDate() - 1);
  }

  // ★ ここで「今日のニブイチ日付」が決まる
  // ★ そこから「昨日」を引く（Functions と同じ）
  jst.setDate(jst.getDate() - 1);

  const y = jst.getFullYear();
  const m = String(jst.getMonth() + 1).padStart(2, "0");
  const d = String(jst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function GachaDetailPage() {
  const { code } = useParams();
  const router = useRouter();

  const [gacha, setGacha] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(true);
  const [error, setError] = useState("");

  const [allResults, setAllResults] = useState<any[]>([]);
  const [currentUid, setCurrentUid] = useState<string | null>(null);

  /* --------------------------------------------------
     Auth 状態を正しく追跡（初期 null 問題を解消）
  -------------------------------------------------- */
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setCurrentUid(user?.uid ?? null);
    });
    return () => unsub();
  }, []);

  /* --------------------------------------------------
     uid が確定してからロード
  -------------------------------------------------- */
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUid]);

  /* --------------------------------------------------
     ガチャ情報 + アクセス制御 + 結果取得
  -------------------------------------------------- */
  const load = async () => {
    setLoading(true);
    setError("");

    const snap = await getDoc(doc(db, "gachaCodes", code as string));

    if (!snap.exists()) {
      setError("ガチャが存在しません");
      setLoading(false);
      return;
    }

    const data = snap.data();
    const flags: string[] = data.publicFlags ?? [];

    const isPublic = flags.includes("public");
    const isLimited = flags.includes("limited");
    const isSubscriberOnly = flags.includes("subscriber");
    const isWinnerOnly = flags.includes("nibuichi_winner");
    const isXAccountMatch = flags.includes("x_account_match");

    // 公開でない → ログイン必須
    if (!isPublic && !currentUid) {
      setError("このガチャは限定公開です");
      setLoading(false);
      return;
    }

    // limited → 過去に引いた人のみ
    if (isLimited) {
      if (!currentUid) {
        setError("このガチャは限定公開です");
        setLoading(false);
        return;
      }

      const historyRef = doc(db, "userGachaHistory", `${currentUid}_${code}`);
      const historySnap = await getDoc(historyRef);

      if (!historySnap.exists()) {
        setError("このガチャは限定公開です");
        setLoading(false);
        return;
      }
    }

    // subscriber → サブスク限定
    if (isSubscriberOnly) {
      if (!currentUid) {
        setError("このガチャはサブスク会員限定です");
        setLoading(false);
        return;
      }

      const userSnap = await getDoc(doc(db, "users", currentUid));
      const user = userSnap.data();

      if (!user?.subscriber) {
        setError("このガチャはサブスク会員限定です");
        setLoading(false);
        return;
      }
    }

    // nibuichi_winner → 前日的中者限定
    if (isWinnerOnly) {
      if (!currentUid) {
        setError("このガチャは前日のニブイチ的中者限定です（ログインが必要です）");
        setLoading(false);
        return;
      }

      const uid = currentUid;
      const prevDay = getPrevDayJST6();

      const predRef = doc(
        db,
        "nibuichi_daily",
        prevDay,
        "predictions",
        uid
      );
      const predSnap = await getDoc(predRef);

      if (!predSnap.exists()) {
        setError("このガチャは前日のニブイチ的中者限定です（予想なし）");
        setLoading(false);
        return;
      }

      const prediction = predSnap.data().prediction;
      const result = predSnap.data().result;

      if (prediction !== result) {
        setError("このガチャは前日のニブイチ的中者限定です（不的中）");
        setLoading(false);
        return;
      }
    }

    // Xアカウント一致
    if (isXAccountMatch) {
      if (!currentUid) {
        setError("このガチャはXアカウント登録者のみ引けます");
        setLoading(false);
        return;
      }

      const userSnap = await getDoc(doc(db, "users", currentUid));
      const user = userSnap.data();
      const userX = (user?.xAccount ?? "").toLowerCase();

      if (!userX) {
        setError("Xアカウントを登録していないため、このガチャは引けません");
        setLoading(false);
        return;
      }

      const list = (data.xAccountList ?? []).map((s: string) =>
        s.toLowerCase()
      );

      const matched = list.some((entry: string) => entry.includes(userX));

      if (!matched) {
        setError("このガチャは指定されたXアカウントのみ引けます");
        setLoading(false);
        return;
      }
    }

    /* --------------------------------------------------
       ★ サブコレクションから結果取得
    -------------------------------------------------- */
    setResultsLoading(true);

    const snapResults = await getDocs(
      query(
        collection(db, "gachaResults", code as string, "results"),
        orderBy("createdAt", "desc")
      )
    );

    const list = snapResults.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }))
      .filter((d) => d.createdAt);

    setAllResults(list);
    setResultsLoading(false);

    // アクセスOK
    setGacha(data);
    setLoading(false);
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
        ガチャを引く
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
   ★ 簡易 FrameList
------------------------------------------ */
function SimpleFrameList({ frames, mode, results, currentUid, getUserInfo }: any) {
  return (
    <div style={{ marginTop: 16 }}>
      {frames.map((f: any) => {
        const frameName = f.label;

        const list = results.filter((r: any) => r.frame === frameName);

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
   ★ 名前表示（@正規化済み）
------------------------------------------ */
function UserNameItem({ result, currentUid, getUserInfo }: any) {
  const [name, setName] = useState("読み込み中…");

  useEffect(() => {
    (async () => {
      const n = await getUserInfo(result.uid);
      setName(n);
    })();
  }, [result.uid, getUserInfo]);

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
