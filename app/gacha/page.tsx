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

  // ★ スロット演出用
  const [spinning, setSpinning] = useState(false);
  const [phase, setPhase] = useState<"idle" | "accel" | "steady" | "decel" | "stop">("idle");
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
      const fn = httpsCallable(functions, "useGachaCode");
      const res: any = await fn({ code });

      const frame = res.data.frame;
      setFinalFrame(frame);

      // ★ 演出開始
      setSpinning(true);
      setPhase("accel");

      // 加速 → 等速 → 減速 → 停止
      setTimeout(() => setPhase("steady"), 200);     // 加速 0.2s
      setTimeout(() => setPhase("decel"), 1400);     // 等速 1.2s
      setTimeout(() => {
        setPhase("stop");
        setSpinning(false);
        setResult(res.data);
      }, 2200); // 減速 0.8s

    } catch (e: any) {
      setSpinning(false);
      setError(e.message);
    }
  };

  // ★ リールの速度設定
  const getSpeed = () => {
    switch (phase) {
      case "accel": return "spin-fast 0.1s linear infinite";
      case "steady": return "spin-mid 0.15s linear infinite";
      case "decel": return "spin-slow 0.25s linear infinite";
      case "stop": return "none";
      default: return "none";
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ textAlign: "center", marginBottom: 20 }}>🎰 ガチャを引く</h1>

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

          {/* 🎰 3リールスロット */}
          <div
            style={{
              marginTop: 30,
              height: 140,
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  overflow: "hidden",
                  borderRadius: 12,
                  border: "3px solid #4f46e5",
                  background: "#f8fafc",
                  position: "relative",
                }}
              >
                {/* 上フェード */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: 40,
                    background:
                      "linear-gradient(to bottom, rgba(248,250,252,1), rgba(248,250,252,0))",
                    zIndex: 10,
                  }}
                />

                {/* 下フェード */}
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    width: "100%",
                    height: 40,
                    background:
                      "linear-gradient(to top, rgba(248,250,252,1), rgba(248,250,252,0))",
                    zIndex: 10,
                  }}
                />

                {/* 中央ライン（当たり位置） */}
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: 0,
                    width: "100%",
                    height: 4,
                    background: "#ef4444",
                    transform: "translateY(-50%)",
                    zIndex: 20,
                  }}
                />

                {/* 回転リスト */}
                <div
                  style={{
                    animation: spinning ? getSpeed() : "none",
                    fontSize: 24,
                    padding: 10,
                  }}
                >
                  {(gacha.frames || []).map((f: any) => (
                    <div
                      key={f.label}
                      style={{
                        padding: "12px 0",
                        textAlign: "center",
                        background:
                          !spinning && finalFrame === f.label && i === 1
                            ? "#d1fae5"
                            : "#ffffff",
                        borderBottom: "1px solid #e5e7eb",
                        fontWeight:
                          !spinning && finalFrame === f.label && i === 1
                            ? "bold"
                            : "normal",
                      }}
                    >
                      {spinning ? f.label : finalFrame || ""}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* CSS アニメーション */}
          <style>{`
            @keyframes spin-fast {
              0% { transform: translateY(0); }
              100% { transform: translateY(-60px); }
            }
            @keyframes spin-mid {
              0% { transform: translateY(0); }
              100% { transform: translateY(-40px); }
            }
            @keyframes spin-slow {
              0% { transform: translateY(0); }
              100% { transform: translateY(-20px); }
            }
          `}</style>

          {/* 回転中のラベル */}
          {spinning && (
            <p style={{ textAlign: "center", marginTop: 10, color: "#4f46e5" }}>
              🎡 回転中…
            </p>
          )}

          {/* 当たりラベル */}
          {!spinning && finalFrame && (
            <p
              style={{
                textAlign: "center",
                marginTop: 10,
                color: "#10b981",
                fontWeight: "bold",
              }}
            >
              🎉 当たり！
            </p>
          )}

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
