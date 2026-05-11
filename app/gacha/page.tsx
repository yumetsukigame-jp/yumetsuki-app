"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions, db } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function GachaPage() {
  const router = useRouter();

  // ★ URL の ?code=XXXX を安全に取得
  const [code, setCode] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const c = params.get("code") ?? "";
      setCode(c);
    }
  }, []);

  const [gacha, setGacha] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [result, setResult] = useState<any>(null);

  // ★ 演出用
  const [spinning, setSpinning] = useState(false);
  const [finalFrame, setFinalFrame] = useState("");

  const checkCode = async () => {
    setError("");
    setGacha(null);
    setResult(null);

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

    // ★ 限定ガチャでも誰でも引ける（履歴チェックなし）
    setGacha(data);
    setLoading(false);
  };

  const play = async () => {
    setError("");
    setResult(null);
    setFinalFrame("");

    try {
      // ★ 演出開始
      setSpinning(true);

      const fn = httpsCallable(functions, "useGachaCode");
      const res: any = await fn({ code });

      // ★ 2秒後に停止して結果表示
      setTimeout(() => {
        setSpinning(false);
        setFinalFrame(res.data.frame);
        setResult(res.data);
      }, 2000);

    } catch (e: any) {
      setSpinning(false);
      setError(e.message);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ textAlign: "center", marginBottom: 20 }}>🎲 ガチャを引く</h1>

      <div
        style={{
          background: "white",
          padding: 20,
          borderRadius: 12,
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          marginBottom: 20,
        }}
      >
        <label style={{ fontWeight: "bold" }}>ガチャコード：</label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="例：ABCD1234"
          style={{
            padding: 10,
            border: "1px solid #ccc",
            borderRadius: 6,
            width: "100%",
            marginTop: 8,
            marginBottom: 16,
            fontSize: 16,
          }}
        />

        <button
          onClick={checkCode}
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px 0",
            background: "#4f46e5",
            color: "white",
            borderRadius: 8,
            border: "none",
            fontSize: 18,
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          {loading ? "確認中…" : "ガチャを確認"}
        </button>

        {error && (
          <div style={{ marginTop: 16, color: "red", fontWeight: "bold" }}>
            ⚠ エラー：{error}
          </div>
        )}
      </div>

      {/* ★ ガチャ情報があるときだけ表示 */}
      {gacha && (
        <>
          <h2 style={{ textAlign: "center", marginBottom: 10 }}>
            {gacha.title}
          </h2>

          <button
            onClick={play}
            style={{
              width: "100%",
              padding: "12px 0",
              background: "#10b981",
              color: "white",
              borderRadius: 8,
              border: "none",
              fontSize: 18,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            ガチャを引く（演出あり）
          </button>

          {/* 🎡 ルーレット演出 */}
          <div
            style={{
              marginTop: 30,
              height: 120,
              overflow: "hidden",
              borderRadius: 12,
              border: "2px solid #4f46e5",
              position: "relative",
            }}
          >
            {/* 中央のガイド線 */}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: 0,
                width: "100%",
                height: 2,
                background: "#4f46e5",
                transform: "translateY(-50%)",
                zIndex: 10,
              }}
            />

            {/* 回転リスト */}
            <div
              style={{
                animation: spinning ? "spin 0.2s linear infinite" : "none",
                fontSize: 28,
                padding: 10,
              }}
            >
              {(gacha.frames || []).map((f: any) => (
                <div key={f.label} style={{ padding: 8, textAlign: "center" }}>
                  {spinning ? f.label : finalFrame || ""}
                </div>
              ))}
            </div>
          </div>

          {/* CSS アニメーション */}
          <style>{`
            @keyframes spin {
              0% { transform: translateY(0); }
              100% { transform: translateY(-40px); }
            }
          `}</style>

          {/* ★ 結果カード */}
          {result && (
            <div
              style={{
                background: "white",
                padding: 20,
                borderRadius: 12,
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                marginTop: 20,
                textAlign: "center",
              }}
            >
              <h2>🎉 結果</h2>
              <p style={{ fontSize: 20, margin: "10px 0" }}>
                <strong>枠：</strong> {result.frame}
              </p>
              <p style={{ fontSize: 20 }}>
                <strong>報酬：</strong> {result.reward} pt
              </p>

              <button
                onClick={() => router.push(`/gacha/results?code=${code}`)}
                style={{
                  marginTop: 20,
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
