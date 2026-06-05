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
import { onAuthStateChanged } from "firebase/auth";

/* --------------------------------------------------
   JST 6時切り替え（完全修正版）
-------------------------------------------------- */
function nowJST() {
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value;

  // ★ 秒の後ろに ":00" を付けない（これがバグの原因だった）
  return new Date(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get(
      "minute"
    )}:${get("second")}+09:00`
  );
}

function getYesterdayJST6() {
  const now = nowJST();
  const hour = now.getHours();

  const target = new Date(now);

  if (hour < 6) {
    target.setDate(target.getDate() - 2);
  } else {
    target.setDate(target.getDate() - 1);
  }

  if (isNaN(target.getTime())) {
    console.error("Invalid target date in getYesterdayJST6:", target);
    return "";
  }

  return target.toISOString().slice(0, 10);
}

/* --------------------------------------------------
   ユーザー名キャッシュ
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

export default function GachaDetailPage() {
  const { code } = useParams();
  const router = useRouter();

  /* --------------------------------------------------
     Auth 状態
  -------------------------------------------------- */
  const [uid, setUid] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  /* --------------------------------------------------
     ページ状態
  -------------------------------------------------- */
  const [gacha, setGacha] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(true);
  const [error, setError] = useState("");

  const [allResults, setAllResults] = useState<any[]>([]);

  /* --------------------------------------------------
     Auth 初期化後にのみ load() を実行
  -------------------------------------------------- */
  useEffect(() => {
    if (!authReady) return;
    load();
  }, [authReady, uid, code]);

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
    const isSubscriberOnly = flags.includes("subscriber");
    const isWinnerOnly = flags.includes("nibuichi_winner");
    const isXAccountMatch = flags.includes("x_account_match");

    /* --------------------------------------------------
       公開設定
    -------------------------------------------------- */
    if (!isPublic && !uid) {
      setError("このガチャは限定公開です（ログインが必要です）");
      setLoading(false);
      return;
    }

    /* --------------------------------------------------
       サブスク限定
    -------------------------------------------------- */
    if (isSubscriberOnly) {
      if (!uid) {
        setError("このガチャはサブスク会員限定です（ログインが必要です）");
        setLoading(false);
        return;
      }

      const userSnap = await getDoc(doc(db, "users", uid));
      const user = userSnap.data();

      if (!user?.subscriber) {
        setError("このガチャはサブスク会員限定です");
        setLoading(false);
        return;
      }
    }

    /* --------------------------------------------------
       前日的中者限定（JST6時切り替え）
    -------------------------------------------------- */
    if (isWinnerOnly) {
      if (!uid) {
        setError("ログインが必要です");
        setLoading(false);
        return;
      }

      const prevDay = getYesterdayJST6();

      const predRef = doc(
        db,
        "nibuichi_daily",
        prevDay,
        "predictions",
        uid
      );
      const predSnap = await getDoc(predRef);

      if (!predSnap.exists()) {
        setError(
          `このガチャは前日のニブイチ的中者限定です（予想なし）\n参照日付: ${prevDay}`
        );
        setLoading(false);
        return;
      }

      const pdata = predSnap.data();
      if (pdata.prediction !== pdata.result) {
        setError("このガチャは前日のニブイチ的中者限定です（不的中）");
        setLoading(false);
        return;
      }
    }

/* --------------------------------------------------
   Xアカウント一致
-------------------------------------------------- */
if (isXAccountMatch) {
  if (!uid) {
    setError("このガチャはXアカウント登録者のみ引けます");
    setLoading(false);
    return;
  }

  const userSnap = await getDoc(doc(db, "users", uid));
  const user = userSnap.data();

  // ★ 最強 normalize（不可視文字・全角カッコ・全角@・改行すべて除去）
  function normalizeX(x: string) {
    return x
      .toLowerCase()
      .replace(/[\s\r\n\t]+/g, "")              // 改行・空白・タブ
      .replace(/[()（）【】［］]/g, "")         // 全角・半角カッコ類
      .replace(/[@＠]/g, "")                    // 全角・半角 @
      .replace(/[\u200B-\u200D\uFEFF]/g, "")    // ゼロ幅スペース類
      .replace(/[^\x20-\x7E]/g, "");            // その他不可視文字
  }

  const userX = normalizeX(user?.xAccount ?? "");

  if (!userX) {
    setError("Xアカウントを登録していないため、このガチャは引けません");
    setLoading(false);
    return;
  }

  // ★ ガチャ側リストから「@ を含む行」だけを抽出（名前行を除外）
  const rawList = (data.xAccountList ?? []).filter((s: string) =>
    s.includes("@")
  );

  // ★ normalize
  const list = rawList.map((s: string) => normalizeX(s));

  // ★ 部分一致（あなたの仕様）
  const matched = list.some((entry: string) => entry.includes(userX));

  if (!matched) {
    setError("このガチャは指定されたXアカウント(リポストなど条件達成者)のみ引けます");
    setLoading(false);
    return;
  }
}


    /* --------------------------------------------------
       結果取得
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

    setGacha(data);
    setLoading(false);
  };

  /* --------------------------------------------------
     Auth 初期化前は UI を動かさない
  -------------------------------------------------- */
  if (!authReady) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        読み込み中…
      </div>
    );
  }

  if (loading) return <p style={{ padding: 24 }}>読み込み中…</p>;

  if (error)
    return (
      <pre style={{ padding: 24, color: "red", whiteSpace: "pre-wrap" }}>
        {error}
      </pre>
    );

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
        onClick={() => router.push(`/gacha?code=${code}`)}
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
          currentUid={uid}
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
   簡易 FrameList
------------------------------------------ */
function SimpleFrameList({
  frames,
  mode,
  results,
  currentUid,
  getUserInfo,
}: any) {
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
   名前表示
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
