"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions, db } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function GachaPage() {
  const router = useRouter();

  // URL の ?code=XXXX を取得
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

  // スロット演出用
  const [spinLeft, setSpinLeft] = useState(false);
  const [spinCenter, setSpinCenter] = useState(false);
  const [spinRight, setSpinRight] = useState(false);

  const [stopLeft, setStopLeft] = useState(false);
  const [stopCenter, setStopCenter] = useState(false);
  const [stopRight, setStopRight] = useState(false);

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

    setGacha(snap.data());
    setLoading(false);
  };

  const play = async () => {
    setError("");
    setResult(null);

    try {
      const fn = httpsCallable(functions, "useGachaCode");
      const res: any = await fn({ code });

      const frame = res.data.frame;
      setFinalFrame(frame);

      // 3 リール回転開始
      setSpinLeft(true);
      setSpinCenter(true);
      setSpinRight(true);

      // 左リール停止（ランダム）
      setTimeout(() => {
        setSpinLeft(false);
        setStopLeft(true);
      }, 1500);

      // 中央リール停止（当選枠）
      setTimeout(() => {
        setSpinCenter(false);
        setStopCenter(true);
      }, 2000);

      // 右リール停止（ランダム）
      setTimeout(() => {
        setSpinRight(false);
        setStopRight(true);
        setResult(res.data);
      }, 2500);

    } catch (e: any) {
      setSpinLeft(false);
      setSpinCenter(false);
      setSpinRight(false);
      setError(e.message);
    }
  };

  // リールコンポーネント（上下だけ回転）
  const Reel = ({ spinning, stop, frames, isCenter }: any) => {
    const displayList = spinning
      ? [...frames, ...frames, ...frames]
      : frames;

    return (
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          borderRadius: 12,
          border: "3px solid #4f46e5",
          background: "#f8fafc",
          position: "relative",
          height: 180,
        }}
      >
        {/* 上フェード */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: 50,
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
            height: 50,
            background:
              "linear-gradient(to top, rgba(248,250,252,1), rgba(248,250,252,0))",
            zIndex: 10,
          }}
        />

        {/* 中央帯（固定） */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            width: "100%",
            height: 40,
            background: "#fde047",
            transform: "translateY(-50%)",
            zIndex: 20,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontWeight: "bold",
            fontSize: 18,
            borderTop: "2px solid #facc15",
            borderBottom: "2px solid #facc15",
          }}
        >
          当選内容！
        </div>

        {/* リール内容（上下だけ回転） */}
        <div
          style={{
            animation: spinning ? "spin 0.15s linear infinite" : "none",
            fontSize: 24,
            padding: 10,
          }}
        >
          {displayList.map((f: any, idx: number) => (
            <div
              key={idx}
              style={{
                padding: "12px 0",
                textAlign: "center",
                background:
                  stop && isCenter && f.label === finalFrame
                    ? "#d1fae5"
                    : "#ffffff",
                borderBottom: "1px solid #e5e7eb",
                fontWeight:
                  stop && isCenter && f.label === finalFrame
                    ? "bold"
                    : "normal",
              }}
            >
              {f.label}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ textAlign: "center", marginBottom: 20 }}>🎰 ガチャを引く</h1>

      {/* コード入力 */}
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

      {/* ガチャ情報 */}
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
              height: 180,
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <Reel
              spinning={spinLeft}
              stop={stopLeft}
              frames={gacha.frames}
              isCenter={false}
            />
            <Reel
              spinning={spinCenter}
              stop={stopCenter}
              frames={gacha.frames}
              isCenter={true}
            />
            <Reel
              spinning={spinRight}
              stop={stopRight}
              frames={gacha.frames}
              isCenter={false}
            />
          </div>

          {/* CSS アニメーション */}
          <style>{`
            @keyframes spin {
              0% { transform: translateY(0); }
              100% { transform: translateY(-60px); }
            }
          `}</style>

          {/* 結果 */}
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
