"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/firebase";

type CodeType = "global" | "perUser" | "limited";

type CodePreview = {
  code: string;
  points: number;
  type: CodeType;
  maxUses: number | null;
  usedCount: number;
  alreadyUsed: boolean;
  users: Array<{
    uid: string;
    displayName: string;
    xAccount: string;
  }>;
};

export default function CodePage() {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<CodePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const loadPreview = async () => {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      setMessage("コードを入力してください");
      setPreview(null);
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const user = auth.currentUser;
      if (!user) {
        router.push("/login");
        return;
      }

      const getPreview = httpsCallable<
        { code: string },
        CodePreview
      >(functions, "getPointCodePreview");
      const result = await getPreview({ code: normalizedCode });
      setPreview(result.data);
    } catch (error) {
      console.error("コード情報の取得に失敗しました", error);
      const errorCode = getFunctionErrorCode(error);
      setMessage(
        errorCode === "functions/not-found"
          ? "無効なコードです"
          : errorCode === "functions/unauthenticated"
            ? "ログインが必要です"
            : "コード情報を取得できませんでした"
      );
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const redeemCode = async () => {
    if (!preview || loading) return;

    const user = auth.currentUser;
    if (!user) {
      router.push("/login");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const redeem = httpsCallable<
        { code: string },
        { points: number }
      >(functions, "redeemPointCode");
      const result = await redeem({ code: preview.code });

      await loadPreview();
      setMessage(`${result.data.points} pt を付与しました！`);
    } catch (error) {
      const errorCode = getFunctionErrorCode(error);
      const messages: Record<string, string> = {
        "functions/not-found": "コードまたはユーザー情報が見つかりません",
        "functions/already-exists": "このコードはすでに使用されています",
        "functions/resource-exhausted": "このコードは使用可能人数に達しています",
        "functions/failed-precondition":
          "コードを使用するための条件を満たしていません",
        "functions/invalid-argument": "コードの設定が不正です",
      };
      const errorReason =
        typeof error === "object" &&
        error !== null &&
        "details" in error &&
        typeof error.details === "object" &&
        error.details !== null &&
        "reason" in error.details
          ? error.details.reason
          : null;
      if (!messages[errorCode]) {
        console.error("コードの使用に失敗しました", error);
      }
      setMessage(
        errorReason === "x-account-required"
          ? "Xアカウントが未登録です。プロフィール画面から登録してください。"
          : messages[errorCode] ?? "エラーが発生しました"
      );
    } finally {
      setLoading(false);
    }
  };

  const isLimitReached =
    preview?.type === "limited" &&
    preview.maxUses !== null &&
    preview.usedCount >= preview.maxUses;
  const isUnavailable = isLimitReached || preview?.alreadyUsed === true;

  return (
    <div style={{ padding: "20px", maxWidth: "480px", margin: "0 auto" }}>
      <h1>コード入力でポイント獲得</h1>

      <p
        style={{
          background: "#fff3cd",
          padding: "10px",
          borderRadius: "6px",
          border: "1px solid #ffeeba",
          color: "#856404",
          marginBottom: "16px",
          fontSize: "14px",
          lineHeight: "1.5",
        }}
      >
        ※「<strong>YG-●●●●</strong>」形式のコードは
        <strong>ガチャ専用コード</strong>です。
        <br />
        ここでは入力できませんのでご注意ください。
      </p>

      <input
        type="text"
        value={code}
        onChange={(event) => {
          setCode(event.target.value);
          setPreview(null);
          setMessage("");
        }}
        placeholder="コードを入力"
        style={{ width: "100%", padding: "10px", marginBottom: "10px" }}
      />

      <button
        onClick={() => void loadPreview()}
        disabled={loading}
        style={{
          width: "100%",
          padding: "12px",
          background: loading ? "#999" : "#4f46e5",
          color: "white",
          borderRadius: "8px",
          fontSize: "16px",
        }}
      >
        {loading ? "確認中…" : "コード情報を確認"}
      </button>

      {preview && (
        <div
          style={{
            marginTop: 16,
            padding: 14,
            border: "1px solid #c7d2fe",
            borderRadius: 8,
            background: "#eef2ff",
          }}
        >
          <p>
            <strong>付与ポイント：</strong> {preview.points} pt
          </p>
          <p>
            <strong>利用条件：</strong> {getCodeTypeLabel(preview)}
          </p>
          <p>
            <strong>使用人数：</strong> {preview.usedCount}
            {preview.maxUses !== null ? ` / ${preview.maxUses}` : ""} 人
          </p>

          <p style={{ marginBottom: 6 }}>
            <strong>使用したユーザー：</strong>
          </p>
          {preview.users.length === 0 ? (
            <p>まだ使用されていません。</p>
          ) : (
            <ul style={{ paddingLeft: 20 }}>
              {preview.users.map((usedUser) => (
                <li key={usedUser.uid}>
                  {usedUser.displayName}（{usedUser.xAccount}）
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={() => void redeemCode()}
            disabled={loading || isUnavailable}
            style={{
              width: "100%",
              marginTop: 10,
              padding: "12px",
              background: loading || isUnavailable ? "#999" : "#16a34a",
              color: "white",
              borderRadius: "8px",
              fontSize: "16px",
            }}
          >
            {preview.alreadyUsed
              ? "このコードは使用済みです"
              : isLimitReached
                ? "使用可能人数に達しています"
                : "ポイントを受け取る"}
          </button>
        </div>
      )}

      {message && (
        <p style={{ marginTop: "10px", color: "red", fontWeight: "bold" }}>
          {message}
        </p>
      )}

      {message.includes("Xアカウントが未登録") && (
        <button
          onClick={() => router.push("/profile")}
          style={{
            marginTop: "10px",
            width: "100%",
            padding: "12px",
            background: "#2563eb",
            color: "white",
            borderRadius: "8px",
            fontSize: "16px",
          }}
        >
          プロフィールを編集する
        </button>
      )}
    </div>
  );
}

function getCodeTypeLabel(preview: CodePreview) {
  if (preview.type === "global") return "全員で1回だけ使用可能";
  if (preview.type === "limited") {
    return `各ユーザー1回・先着${preview.maxUses ?? 0}人まで`;
  }
  return "各ユーザー1回ずつ使用可能";
}

function getFunctionErrorCode(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : "unknown";
}
