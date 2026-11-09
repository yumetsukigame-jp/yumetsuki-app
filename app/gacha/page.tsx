"use client";

import type { DocumentData } from "firebase/firestore";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions, db, auth } from "@/firebase";
import {
  doc,
  getDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import LoadingState from "@/app/components/LoadingState";
import GachaAnimation from "@/components/GachaAnimation";
import { claimGachaShipping } from "@/app/lib/fulfillment";
import { matchesXAccountRow } from "../../functions/src/common/normalize";

/* --------------------------------------------------
   JST 6時切り替え（Functions と完全一致）
-------------------------------------------------- */
function nowJST() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );
}

function getYesterdayJST6() {
  const now = nowJST();
  if (now.getHours() < 6) {
    now.setDate(now.getDate() - 2);
  } else {
    now.setDate(now.getDate() - 1);
  }
  return now.toISOString().slice(0, 10);
}

export default function GachaInner() {
  const router = useRouter();

  const [code, setCode] = useState("");
  const [gacha, setGacha] = useState<DocumentData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [result, setResult] = useState<DocumentData | null>(null);

  const [spinning, setSpinning] = useState(false);
  const [stop, setStop] = useState(false);
  const [finalFrame, setFinalFrame] = useState("");

  const [userPoints, setUserPoints] = useState<number>(0);

  const [animation, setAnimation] = useState<"win" | "lose" | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const finishAnimation = useCallback(() => {
    setSpinning(false);
    setStop(true);
    setAnimation(null);
    setIsPlaying(false);
  }, []);
  const [isShipping, setIsShipping] = useState(false);
  const [shippingDecisionResolved, setShippingDecisionResolved] =
    useState(false);
  const shippingGuardActiveRef = useRef(false);

  const shippingReceiptRef = useRef<{ resultId: string; uid: string } | null>(null);
  const shouldWarnBeforeLeaving =
    Boolean(result?.shippingEnabled) &&
    !shippingDecisionResolved;
  const shippingWarningMessage =
    "この画面を遷移すると賞品はポイントとして確定し、今回の景品の発送は出来なくなります。移動してよろしいですか？";

  const confirmAbandonShipping = () => {
    if (!shippingGuardActiveRef.current) return true;
    if (!confirm(shippingWarningMessage)) return false;

    shippingGuardActiveRef.current = false;
    setShippingDecisionResolved(true);
    const receipt = shippingReceiptRef.current;
    if (receipt) {
      void claimGachaShipping({ resultId: receipt.resultId, participantUid: receipt.uid, choice: "points", confirmed: true })
        .catch(error => console.error("ポイント受取の確定に失敗しました", error));
      shippingReceiptRef.current = null;
    }
    return true;
  };

  useEffect(() => {
    shippingGuardActiveRef.current = shouldWarnBeforeLeaving;
    if (!shouldWarnBeforeLeaving) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = shippingWarningMessage;
    };

    const handleNavigationClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const navigationElement = target.closest(
        "a[href], header, footer button"
      );
      if (!navigationElement || confirmAbandonShipping()) return;

      event.preventDefault();
      event.stopPropagation();
    };

    window.history.pushState(
      { ...window.history.state, gachaShippingGuard: true },
      "",
      window.location.href
    );

    const handlePopState = () => {
      if (!shippingGuardActiveRef.current) return;

      if (confirmAbandonShipping()) {
        window.setTimeout(() => window.history.back(), 0);
        return;
      }

      window.history.pushState(
        { ...window.history.state, gachaShippingGuard: true },
        "",
        window.location.href
      );
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleNavigationClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleNavigationClick, true);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [shouldWarnBeforeLeaving]);

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
     URL から code を取得
  -------------------------------------------------- */
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const c = params.get("code") ?? "";
      void Promise.resolve().then(() => setCode(c));
    }
  }, []);

  /* --------------------------------------------------
     ユーザーポイント読み込み（uid が確定してから）
  -------------------------------------------------- */
  useEffect(() => {
    if (!authReady || !uid) return;

    const loadUserPoints = async () => {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        setUserPoints(snap.data().points ?? 0);
      }
    };

    loadUserPoints();
  }, [authReady, uid]);

  /* --------------------------------------------------
     公開設定の表示
  -------------------------------------------------- */
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

  /* --------------------------------------------------
     ガチャコード確認（Auth 初期化後にのみ実行）
  -------------------------------------------------- */
const checkCode = async () => {
  setError("");
  setGacha(null);
  setResult(null);

  if (!code.trim()) {
    setError("コードを入力してください");
    return;
  }

  if (!authReady) {
    setError("ログイン状態を確認中です。少し待ってください。");
    return;
  }

  const userUid = uid;

  setLoading(true);

  const snap = await getDoc(doc(db, "gachaCodes", code.trim()));

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
  if (!isPublic && !userUid) {
    setError("このガチャは限定公開です（ログインが必要です）");
    setLoading(false);
    return;
  }

  /* --------------------------------------------------
     サブスク限定
  -------------------------------------------------- */
  if (isSubscriberOnly) {
    if (!userUid) {
      setError("このガチャはサブスク会員限定です");
      setLoading(false);
      return;
    }

    const userSnap = await getDoc(doc(db, "users", userUid));
    const user = userSnap.data();

    if (!user?.subscriber) {
      setError("このガチャはサブスク会員限定です");
      setLoading(false);
      return;
    }
  }

  /* --------------------------------------------------
     前日的中者限定
  -------------------------------------------------- */
  if (isWinnerOnly) {
    if (!userUid) {
      setError("このガチャは前日のニブイチ的中者限定です");
      setLoading(false);
      return;
    }

    const prevDay = getYesterdayJST6();

    const predRef = doc(
      db,
      "nibuichi_daily",
      prevDay,
      "predictions",
      userUid
    );
    const predSnap = await getDoc(predRef);

    if (!predSnap.exists()) {
      setError(
        `このガチャは前日のニブイチ的中者限定です（予想なし）(※日付更新は6-9時の間です。)\n参照日付: ${prevDay}`
      );
      setLoading(false);
      return;
    }

    const prediction = predSnap.data().prediction;
    const result = predSnap.data().result;

    if (prediction !== result) {
      setError("このガチャは前日のニブイチ的中者限定です（不的中）(※日付更新は6-9時の間です。)");
      setLoading(false);
      return;
    }
  }

  /* --------------------------------------------------
     Xアカウント一致
  -------------------------------------------------- */
  if (isXAccountMatch) {
    if (!userUid) {
      setError("このガチャはXアカウント登録者のみ引けます");
      setLoading(false);
      return;
    }

    const userSnap = await getDoc(doc(db, "users", userUid));
    const user = userSnap.data();

    const userX = user?.xAccount ?? "";

    if (!userX) {
      setError("Xアカウントを登録していないため、このガチャは引けません");
      setLoading(false);
      return;
    }

    const matched = (data.xAccountList ?? []).some((entry: string) => matchesXAccountRow(entry, userX));

    if (!matched) {
      setError("このガチャは指定されたXアカウント(リポストなど条件達成者)のみ引けます");
      setLoading(false);
      return;
    }
  }

  try {
    const unlock = httpsCallable(functions, "unlockGachaCode");
    await unlock({ code: code.trim() });
  } catch (error: unknown) {
    console.error("ガチャコードの確認に失敗しました", error);
    setError(
      error instanceof Error
        ? error.message
        : "ガチャコードの確認に失敗しました"
    );
    setLoading(false);
    return;
  }

  setGacha(data);
  setLoading(false);
};


  /* --------------------------------------------------
     ★ ガチャ実行（連打防止付き）
  -------------------------------------------------- */
  const play = async () => {
    if (isPlaying || !gacha) return;
    if (!confirmAbandonShipping()) return;

    setIsPlaying(true);
    setShippingDecisionResolved(false);

    setError("");
    setResult(null);
    setStop(false);

    try {
      const participantUid = auth.currentUser?.uid;
      if (!participantUid) throw new Error("ログインが必要です");
      const fn = httpsCallable(functions, "useGachaCode");
      const res: DocumentData = await fn({ code });
      if (auth.currentUser?.uid !== participantUid) throw new Error("ログインアカウントが変更されました。再読込してください");

      const frame = res.data.frame;
      shippingReceiptRef.current = res.data.shippingEnabled
        ? { resultId: res.data.resultId, uid: participantUid }
        : null;

      setFinalFrame(frame);

      const frames = gacha.frames.map((f: DocumentData) => f.label);
      const lastFrame = frames[frames.length - 1];
      const isLose = frame === lastFrame;

      setResult(res.data);
      setAnimation(isLose ? "lose" : "win");
      setSpinning(true);

      if (uid) {
        void getDoc(doc(db, "users", uid)).then((snap) => {
          if (snap.exists()) setUserPoints(snap.data().points ?? 0);
        }).catch(error => console.error("ポイントの更新に失敗しました", error));
      }
    } catch (e: unknown) {
      setSpinning(false);
      setAnimation(null);
      setError(e instanceof Error ? e.message : "抽選に失敗しました");
      setIsPlaying(false);
    }
  };

  /* --------------------------------------------------
   発送処理（ガチャ）
-------------------------------------------------- */
const handleShipping = async () => {
  if (isShipping) return;

  if (!uid) {
    alert("ログインが必要です");
    return;
  }

  if (!result || !gacha) {
    alert("結果がありません");
    return;
  }

  const frameName = result.frame;
  const shippingItemName = `${frameName}（ガチャ）`;

  if (
    !confirm(`${shippingItemName}を発送します。確定してよろしいですか？`)
  ) {
    return;
  }

  setIsShipping(true);
  try {
    const response = await claimGachaShipping({
      resultId: result.resultId, choice: "shipping", participantUid: uid, confirmed: true,
    });
    setUserPoints(response.data.points);
    shippingReceiptRef.current = null;

    shippingGuardActiveRef.current = false;
    setShippingDecisionResolved(true);
    alert("発送依頼を受け付けました！");
    router.push("/reward/complete");
  } catch (error) {
    console.error("発送依頼の保存に失敗しました", error);
    alert("発送依頼を保存できませんでした。時間をおいてもう一度お試しください。");
    setIsShipping(false);
  }
};

  /* --------------------------------------------------
     1リール（縦3段）
  -------------------------------------------------- */
  const renderReel = (frames: DocumentData[]) => {
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
          {frames.map((f: DocumentData, i: number) => (
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

  /* --------------------------------------------------
     JSX（authReady が false の間は UI を動かさない）
  -------------------------------------------------- */
  if (!authReady) {
    return <LoadingState />;
  }

  return (
    <div style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      {animation && <GachaAnimation outcome={animation} onComplete={finishAnimation} />}

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
          disabled={loading || isPlaying}
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

          {typeof gacha.description === "string" &&
            gacha.description.trim() && (
              <p
                style={{
                  margin: "0 0 12px",
                  color: "#4b5563",
                  lineHeight: 1.6,
                  textAlign: "left",
                  whiteSpace: "pre-wrap",
                }}
              >
                {gacha.description}
              </p>
            )}

          <p style={{ textAlign: "center", marginBottom: 10 }}>
            {renderFlags(gacha.publicFlags)}
          </p>

          <button
            onClick={play}
            disabled={isPlaying}
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
            {renderReel(gacha.frames)}
          </div>

          {result && !animation && (
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
                if (result.shippingEnabled) {
                  return (
                    <>
                      <p
                        style={{
                          margin: "18px 0 0",
                          padding: "10px",
                          background: "#fffbeb",
                          borderRadius: 8,
                          color: "#92400e",
                          fontSize: 14,
                          textAlign: "left",
                        }}
                      >
                        発送を希望する場合は、この結果画面で今すぐ選択してください。
                        画面を離れた後や次のガチャを引いた後は、発送を選択できません。
                        発送を選択しない場合は、当選報酬がポイントとして付与されます。
                      </p>
                      <button
                        onClick={handleShipping}
                        disabled={isShipping}
                        style={{
                          marginTop: 12,
                          padding: "12px 20px",
                          background: isShipping ? "#9ca3af" : "#ef4444",
                          color: "white",
                          borderRadius: 8,
                          border: "none",
                          cursor: isShipping ? "not-allowed" : "pointer",
                          width: "100%",
                          fontSize: 16,
                        }}
                      >
                        {isShipping ? "発送依頼を保存中…" : "📦 この商品を発送する"}
                      </button>
                    </>
                  );
                }

                return null;
              })()}

              <button
                onClick={() => {
                  if (!confirmAbandonShipping()) return;
                  router.push(`/gacha/results?code=${code}`);
                }}
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
