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
  const [result, setResult] = useState<any>(null);
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

    if (!data.public) {
      setError("このガチャは限定公開です");
      setLoading(false);
      return;
    }

    setGacha(data);

    // ★ このガチャの結果だけ取得
    const fn = httpsCallable(functions, "getGachaResults");
    const res: any = await fn();
    const list = res.data.filter((r: any) => r.code === code);

    setAllResults(list);
    setLoading(false);
  };

  const play = async () => {
    setError("");
    setResult(null);

    try {
      const fn = httpsCallable(functions, "useGachaCode");
      const res: any = await fn({ code });

      setResult(res.data);

      // ★ 最新の結果を再取得
      const fn2 = httpsCallable(functions, "getGachaResults");
      const res2: any = await fn2();
      setAllResults(res2.data.filter((r: any) => r.code === code));
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (loading) return <p style={{ padding: 24 }}>読み込み中…</p>;
  if (error) return <p style={{ padding: 24, color: "red" }}>{error}</p>;
  if (!gacha) return null;

  const remaining =
    gacha.mode === "count"
      ? gacha.totalCount -
        gacha.frames.reduce((a: number, f: any) => a + (f.usedCount ?? 0), 0)
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

      {error && (
        <p style={{ marginTop: 16, color: "red", fontWeight: "bold" }}>
          ⚠ {error}
        </p>
      )}

      {/* ★ 1回分の結果 */}
      {result && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            background: "white",
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            textAlign: "center",
          }}
        >
          <h2>🎉 結果</h2>
          <p style={{ fontSize: 20 }}>
            <strong>枠：</strong> {result.frame}
          </p>
          <p style={{ fontSize: 20 }}>
            <strong>報酬：</strong> {result.reward} pt
          </p>
        </div>
      )}

      {/* ★ このガチャの全結果（簡易版） */}
      <h2 style={{ marginTop: 32 }}>📜 このガチャの当選状況</h2>

      <SimpleFrameList
        frames={gacha.frames}
        mode={gacha.mode}
        results={allResults}
        currentUid={currentUid}
        getUserInfo={getUserInfo}
      />

      {/* ★ このガチャの結果一覧ページへ */}
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

      {/* ★ 他のガチャの結果一覧へ */}
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
   ★ 簡易版 FrameList（displayName + xAccount 対応）
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
                ? `（${f.usedCount}/${f.maxCount}）`
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
   ★ 名前表示コンポーネント（displayName + xAccount）
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
