"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions, db, auth } from "@/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  increment,
  setDoc,
  collection,
} from "firebase/firestore";

export default function GachaInner() {
  const router = useRouter();

  const [code, setCode] = useState("");
  const [gacha, setGacha] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [result, setResult] = useState<any>(null);

  const [spinning, setSpinning] = useState(false);
  const [stop, setStop] = useState(false);
  const [finalFrame, setFinalFrame] = useState("");

  const [userPoints, setUserPoints] = useState<number>(0);

  const [gif, setGif] = useState<"win" | "lose" | null>(null);

  // ★ 追加：ガチャ実行ロック
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const c = params.get("code") ?? "";
      setCode(c);
    }
  }, []);

  const loadUserPoints = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      setUserPoints(snap.data().points ?? 0);
    }
  };

  useEffect(() => {
    loadUserPoints();
  }, []);

  const renderFlags = (flags: string[] = []) => {
    const map: Record<string, string> = {
      public: "🌐 公開",
      limited: "🔒 限定",
      subscriber: "⭐ サブスク限定",
      nibuichi_winner: "🎯 的中者限定",
      x_account_match: "📝 Xアカウント一致",
    };
    if (flags.length === 0) return "（未設定）";
    return flags.map((f) => map[f] ?? f).join(" / ");
  };

  function getPrevDayJST6() {
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

    const cutoff = new Date(jst);
    cutoff.setHours(6, 0, 0, 0);

    if (jst < cutoff) {
      jst.setDate(jst.getDate() - 1);
    }

    jst.setDate(jst.getDate() - 1);

    const y = jst.getFullYear();
    const m = String(jst.getMonth() + 1).padStart(2, "0");
    const d = String(jst.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

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
    const flags: string[] = data.publicFlags ?? [];
    const uid = auth.currentUser?.uid ?? null;

    const isPublic = flags.includes("public");
    const isSubscriberOnly = flags.includes("subscriber");
    const isWinnerOnly = flags.includes("nibuichi_winner");
    const isXAccountMatch = flags.includes("x_account_match");

    if (!isPublic && !uid) {
      setError("このガチャは限定公開です（ログインが必要です）");
      setLoading(false);
      return;
    }

    if (isSubscriberOnly) {
      if (!uid) {
        setError("このガチャはサブスク会員限定です");
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

    if (isWinnerOnly) {
      if (!uid) {
        setError("このガチャは前日のニブイチ的中者限定です");
        setLoading(false);
        return;
      }

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

    if (isXAccountMatch) {
      if (!uid) {
        setError("このガチャはXアカウント登録者のみ引けます");
        setLoading(false);
        return;
      }

      const userSnap = await getDoc(doc(db, "users", uid));
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

    setGacha(data);
    setLoading(false);
  };

  /* --------------------------------------------------
     ★ ガチャ実行（連打防止付き）
  -------------------------------------------------- */
  const play = async () => {
    if (isPlaying) return; // ★ 連打防止
    setIsPlaying(true);

    setError("");
    setResult(null);
    setStop(false);

    try {
      const fn = httpsCallable(functions, "useGachaCode");
      const res: any = await fn({ code });

      const frame = res.data.frame;
      const reward = res.data.reward;

      setFinalFrame(frame);

      const frames = gacha.frames.map((f: any) => f.label);
      const lastFrame = frames[frames.length - 1];
      const isLose = frame === lastFrame;

      setGif(isLose ? "lose" : "win");

      setSpinning(true);

      setTimeout(() => {
        setSpinning(false);
        setStop(true);
        setResult(res.data);
        loadUserPoints();

        setGif(null);

        setIsPlaying(false); // ★ ロック解除
      }, 10000);

    } catch (e: any) {
      setSpinning(false);
      setGif(null);
      setError(e.message);
      setIsPlaying(false); // ★ エラー時も解除
    }
  };

  /* --------------------------------------------------
     発送処理
  -------------------------------------------------- */
  const handleShipping = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      alert("ログインが必要です");
      return;
    }

    if (!result) {
      alert("結果がありません");
      return;
    }

    const frameName = result.frame;
    const rewardPoints = result.reward;

    const rewardData = {
      rewardId: `gacha_${code}_${Date.now()}`,
      name: `${frameName}（ガチャ）`,
      cost: rewardPoints,
      image: "/rewards/gacha.webp",
      timestamp: new Date(),
      shipped: false,
    };

    await setDoc(doc(db, "selectedRewards", uid), rewardData);

    await setDoc(doc(collection(db, "shippingHistory")), {
      uid,
      ...rewardData,
      requestedAt: new Date(),
    });

    await updateDoc(doc(db, "users", uid), {
      points: increment(-rewardPoints),
    });

    alert("発送物を作成しました！");
    router.push("/reward/complete");
  };

  /* --------------------------------------------------
     1リール（縦3段）
  -------------------------------------------------- */
  const Reel = ({ frames }: any) => {
    return (
      <div
        style={{
          width: "100%",
          height: 180,
          overflow: "hidden",
          borderRadius: 12,
          border: "3px solid #4f46e5",
          background: "#f8fafc",
          position: "relative",
        }}
      >
        <div
          style={{
            animation: spinning ? "spin 0.15s linear infinite" : "none",
          }}
        >
          {frames.map((f: any, i: number) => (
            <div
              key={i}
              style={{
                height: 60,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                background: "#ffffff",
                borderBottom: "1px solid #e5e7eb",
                fontSize: 24,
              }}
            >
              {f.label}
            </div>
          ))}
        </div>

        {stop && (
          <div
            style={{
              position: "absolute",
              top: 60,
              left: 0,
              width: "100%",
              height: 60,
              background: "#d1fae5",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              fontWeight: "bold",
              fontSize: 24,
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            {finalFrame}
          </div>
        )}

        <style>{`
          @keyframes spin {
            0% { transform: translateY(0); }
            100% { transform: translateY(-60px); }
          }
        `}</style>
      </div>
    );
  };

  return (
    <div style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      {/* ★ GIF オーバーレイ */}
      {gif && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999,
          }}
        >
          <img
            src={gif === "win" ? "/gacha/win.gif" : "/gacha/lose.gif"}
            style={{ width: "70%", maxWidth: 500 }}
          />
        </div>
      )}

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

          <p style={{ textAlign: "center", marginBottom: 10 }}>
            {renderFlags(gacha.publicFlags)}
          </p>

          <button
            onClick={play}
            disabled={isPlaying} // ★ 連打防止
            style={{
              width: "100%",
              padding: "12px 0",
              background: isPlaying ? "#6b7280" : "#10b981",
              color: "white",
              borderRadius: 8,
              border: "none",
              fontSize: 18,
              fontWeight: "bold",
              cursor: isPlaying ? "not-allowed" : "pointer",
            }}
          >
            {isPlaying ? "実行中…" : "ガチャを引く"}
          </button>

          <div style={{ marginTop: 30 }}>
            <Reel frames={gacha.frames} />
          </div>

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

              {/* 発送ボタン */}
              {(() => {
                const frameInfo = gacha.frames.find(
                  (f: any) => f.label === result.frame
                );

                if (frameInfo?.shippingEnabled) {
                  return (
                    <button
                      onClick={handleShipping}
                      style={{
                        marginTop: 20,
                        padding: "12px 20px",
                        background: "#ef4444",
                        color: "white",
                        borderRadius: 8,
                        border: "none",
                        cursor: "pointer",
                        width: "100%",
                        fontSize: 16,
                      }}
                    >
                      📦 この商品を発送する
                    </button>
                  );
                }

                return null;
              })()}

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
