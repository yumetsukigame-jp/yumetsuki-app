"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions, db, auth } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function GachaPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // ★ URL の ?code=XXXX を初期値にセット
  const initialCode = searchParams.get("code") ?? "";
  const [code, setCode] = useState(initialCode);

  const [gacha, setGacha] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [historyCount, setHistoryCount] = useState<number | null>(null);
  const uid = auth.currentUser?.uid ?? null;

  const checkCode = async () => {
    setError("");
    setGacha(null);

    if (!code.trim()) {
      setError("コードを入力してください");
      return;
    }

    setLoading(true);

    const snap = await getDoc(doc(db, "gachaCodes", code.trim()));

    if (!snap.exists()) {
      setError("ガチャが存在しません");
      setLoading(false);
      return;
    }

    const data = snap.data();

    // ★ 限定ガチャは履歴がある人だけアクセス可能
    if (!data.public) {
      if (!uid) {
        setError("このガチャは限定公開です");
        setLoading(false);
        return;
      }

      const historyRef = doc(db, "userGachaHistory", `${uid}_${code}`);
      const historySnap = await getDoc(historyRef);

      if (!historySnap.exists()) {
        setError("このガチャは限定公開です");
        setLoading(false);
        return;
      }

      setHistoryCount(historySnap.data().count ?? 0);
    }

    setGacha(data);
    setLoading(false);
  };

  const play = async () => {
    setError("");

    try {
      const fn = httpsCallable(functions, "useGachaCode");
      const res: any = await fn({ code });

      // ★ 結果ページへ遷移（演出後）
      router.push(`/gacha/results?code=${code}`);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>
      <h1>🎰 ガチャを引く</h1>

      <input
        type="text"
        placeholder="ガチャコードを入力"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        style={{
          width: "100%",
          padding: 12,
          border: "1px solid #ccc",
          borderRadius: 8,
          marginBottom: 12,
        }}
      />

      <button
        onClick={checkCode}
        style={{
          width: "100%",
          padding: "12px 20px",
          background: "#2563eb",
          color: "white",
          borderRadius: 8,
          border: "none",
          fontSize: 18,
          cursor: "pointer",
        }}
      >
        ガチャを確認
      </button>

      {loading && <p style={{ marginTop: 16 }}>読み込み中…</p>}
      {error && <p style={{ marginTop: 16, color: "red" }}>{error}</p>}

      {gacha && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            background: "white",
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}
        >
          <h2>{gacha.title}</h2>
          <p>方式：{gacha.mode === "count" ? "枠数方式" : "確率方式"}</p>
          <p>
            1回 {gacha.point.cost} pt（上限 {gacha.point.maxPerUser} 回）
          </p>

          {historyCount !== null && (
            <p>あなたのプレイ回数：{historyCount} 回</p>
          )}

          <button
            onClick={play}
            style={{
              marginTop: 20,
              padding: "12px 20px",
              background: "#10b981",
              color: "white",
              borderRadius: 8,
              border: "none",
              fontSize: 18,
              cursor: "pointer",
              width: "100%",
            }}
          >
            ガチャを引く（演出あり）
          </button>
        </div>
      )}
    </div>
  );
}
