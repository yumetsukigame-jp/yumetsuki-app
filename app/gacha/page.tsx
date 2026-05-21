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

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const c = params.get("code") ?? "";
      setCode(c);
    }
  }, []);

  /* --------------------------------------------------
     ユーザーポイント取得
  -------------------------------------------------- */
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
    };
    if (flags.length === 0) return "（未設定）";
    return flags.map((f) => map[f] ?? f).join(" / ");
  };

  /* --------------------------------------------------
     JST 6:00 基準で前日を求める
  -------------------------------------------------- */
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

  /* --------------------------------------------------
     ガチャコード確認
  -------------------------------------------------- */
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

    // 公開でない場合はログイン必須
    if (!isPublic && !uid) {
      setError("このガチャは限定公開です（ログインが必要です）");
      setLoading(false);
      return;
    }

    // サブスク限定
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

    // 🎯 ニブイチ的中者限定
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

    setGacha(data);
    setLoading(false);
  };

  /* --------------------------------------------------
     ガチャ実行
  -------------------------------------------------- */
  const play = async () => {
    setError("");
    setResult(null);
    setStop(false);

    try {
      const fn = httpsCallable(functions, "useGachaCode");
      const res: any = await fn({ code });

      const frame = res.data.frame;
      setFinalFrame(frame);

      setSpinning(true);

      setTimeout(() => {
        setSpinning(false);
        setStop(true);
        setResult(res.data);
        loadUserPoints(); // ポイント更新
      }, 2000);

    } catch (e: any) {
      setSpinning(false);
      setError(e.message);
    }
  };

  /* --------------------------------------------------
     発送処理（従来フロー完全統合版）
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

    // ★ ガチャ発送物の基本情報（従来の selectedRewards と同じ構造）
    const rewardData = {
      rewardId: `gacha_${code}_${Date.now()}`,
      name: `${frameName}（ガチャ）`,
      cost: rewardPoints,
      image: "/rewards/gacha.webp",
      timestamp: new Date(),
      shipped: false,
    };

    /* -----------------------------------------
       ① selectedRewards/{uid} に保存（従来と同じ）
    ----------------------------------------- */
    await setDoc(doc(db, "selectedRewards", uid), rewardData);

    /* -----------------------------------------
       ② shippingHistory にも保存（従来と同じ）
    ----------------------------------------- */
    await setDoc(doc(collection(db, "shippingHistory")), {
      uid,
      ...rewardData,
      requestedAt: new Date(),
    });

    /* -----------------------------------------
       ③ ポイントを減らす（今回得たポイントを消費）
    ----------------------------------------- */
    await updateDoc(doc(db, "users", uid), {
      points: increment(-rewardPoints),
    });

    alert("発送物を作成しました！");
    router.push("/reward/complete"); // ← 従来の完了ページ
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

              {/* ★ 発送ボタン（shippingEnabled の枠だけ表示） */}
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
