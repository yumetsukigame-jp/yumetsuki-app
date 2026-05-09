"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions, db, auth } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function GachaPage() {
  const [code, setCode] = useState("");
  const [gachaInfo, setGachaInfo] = useState<any>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [userHistory, setUserHistory] = useState<number | null>(null);

  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [finalFrame, setFinalFrame] = useState("");

  const router = useRouter();

  // ★ コード反映（ガチャ情報取得）
  const loadGachaInfo = async () => {
    setError("");
    setGachaInfo(null);
    setFrames([]);
    setUserHistory(null);

    if (!code.trim()) {
      setError("コードを入力してください");
      return;
    }

    const snap = await getDoc(doc(db, "gachaCodes", code.trim()));
    if (!snap.exists()) {
      setError("ガチャコードが存在しません");
      return;
    }

    const data = snap.data();

    setGachaInfo({
      title: data.title,
      mode: data.mode,
      point: data.point,
      createdAt: data.createdAt?.toDate().toLocaleString(),
      expiresAt: data.expiresAt?.toDate().toLocaleString(),
      framesInfo: data.frames,
      totalCount: data.totalCount,
    });

    // ルーレット演出用の枠名
    setFrames(data.frames.map((f: any) => f.label));

    // ★ ユーザーの履歴取得
    const uid = auth.currentUser?.uid;
    if (uid) {
      const h = await getDoc(doc(db, "userGachaHistory", `${uid}_${code}`));
      setUserHistory(h.exists() ? h.data().count : 0);
    }
  };

  // ★ ガチャ実行
  const playGacha = async () => {
    if (!gachaInfo) {
      setError("先にコードを反映してください");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setFinalFrame("");

    // プロフィール確認
    const user = auth.currentUser;
    if (!user) {
      setError("ログインしてください");
      setLoading(false);
      return;
    }

    const snap = await getDoc(doc(db, "users", user.uid));
    const data = snap.data();
    const displayName = data.displayName ?? "";
    const xAccount = data.xAccount ?? "";

    if (!displayName && !xAccount) {
      alert("ガチャを引くには、ニックネームまたはXアカウントを登録してください。");
      router.push("/profile");
      setLoading(false);
      return;
    }

    // ルーレット開始
    setSpinning(true);

    try {
      const fn = httpsCallable(functions, "useGachaCode");
      const res: any = await fn({ code });

      setTimeout(() => {
        setSpinning(false);
        setFinalFrame(res.data.frame);
        setResult(res.data);
        setLoading(false);

        // 履歴更新
        setUserHistory((prev) => (prev !== null ? prev + 1 : 1));
      }, 2000);
    } catch (e: any) {
      setSpinning(false);
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ textAlign: "center", marginBottom: 20 }}>🎲 ガチャを引く</h1>

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
          onClick={loadGachaInfo}
          style={{
            width: "100%",
            padding: "12px 0",
            background: "#2563eb",
            color: "white",
            borderRadius: 8,
            border: "none",
            fontSize: 18,
            fontWeight: "bold",
            cursor: "pointer",
            marginBottom: 10,
          }}
        >
          コードを反映
        </button>

        {error && (
          <div style={{ marginTop: 16, color: "red", fontWeight: "bold" }}>
            ⚠ エラー：{error}
          </div>
        )}
      </div>

      {/* ★ ガチャ詳細表示 */}
      {gachaInfo && (
        <div
          style={{
            background: "white",
            padding: 20,
            borderRadius: 12,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            marginBottom: 20,
          }}
        >
          <h2>{gachaInfo.title}</h2>
          <p>作成日：{gachaInfo.createdAt}</p>
          <p>締切日：{gachaInfo.expiresAt}</p>

          <p>
            方式：{gachaInfo.mode === "count" ? "枠数方式" : "確率方式"}
          </p>

          <p>
            1回 {gachaInfo.point.cost} pt（上限 {gachaInfo.point.maxPerUser} 回）
          </p>

          {userHistory !== null && (
            <p>
              あなたの残り回数：
              {gachaInfo.point.maxPerUser - userHistory} 回
            </p>
          )}

          <h3 style={{ marginTop: 16 }}>🎁 当選枠の状況</h3>

          {gachaInfo.mode === "count" ? (
            <>
              {gachaInfo.framesInfo.map((f: any, i: number) => (
                <p key={i}>
                  {f.label}：{f.usedCount}/{f.maxCount}（残り{" "}
                  {f.maxCount - f.usedCount}）
                </p>
              ))}
            </>
          ) : (
            <>
              {gachaInfo.framesInfo.map((f: any, i: number) => (
                <p key={i}>
                  {f.label}：{Math.round(f.probability * 100)}%
                </p>
              ))}
            </>
          )}

          <button
            onClick={playGacha}
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
              marginTop: 20,
            }}
          >
            {loading ? "抽選中…" : "ガチャを回す"}
          </button>
        </div>
      )}

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

        <div
          style={{
            animation: spinning ? "spin 0.2s linear infinite" : "none",
            fontSize: 28,
            padding: 10,
          }}
        >
          {(frames.length > 0 ? frames : ["A", "B", "C"]).map((f) => (
            <div key={f} style={{ padding: 8, textAlign: "center" }}>
              {spinning ? f : finalFrame || ""}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: translateY(0); }
          100% { transform: translateY(-40px); }
        }
      `}</style>

      {/* 結果カード */}
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
            <strong>報酬：</strong> {result.reward}
          </p>

          {/* ★ 結果一覧ページへのリンク */}
          <button
            onClick={() => router.push(`/gacha/results?code=${code}`)}
            style={{
              marginTop: 16,
              padding: "10px 16px",
              background: "#2563eb",
              color: "white",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            このガチャの結果一覧を見る
          </button>
        </div>
      )}
    </div>
  );
}
