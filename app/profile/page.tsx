"use client";

import { useEffect, useState } from "react";
import { auth, db, functions } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import LoadingState from "@/app/components/LoadingState";
import { withRetry } from "@/app/lib/retry";

export default function ProfilePage() {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [xAccount, setXAccount] = useState("");
  const [xAccountConfirmed, setXAccountConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const snap = await withRetry(() => getDoc(doc(db, "users", user.uid)));
        if (snap.exists()) {
          const data = snap.data();
          setName(data.name ?? "");
          setDisplayName(data.displayName ?? "");
          setXAccount(data.xAccount ?? "");
          setXAccountConfirmed(data.xAccountConfirmed ?? false);
        }
      } catch (error) {
        console.error("プロフィールの読み込みに失敗しました", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const save = async () => {
    const user = auth.currentUser;
    if (!user || saving) return;

    // ★ 必須チェック
    if (!displayName.trim()) {
      alert("ニックネームを入力してください");
      return;
    }

    if (!xAccount.trim()) {
      alert("Xアカウントを入力してください");
      return;
    }

    if (!xAccount.startsWith("@")) {
      alert("Xアカウントは @ から入力してください");
      return;
    }

    setSaving(true);
    try {
      await httpsCallable<
        { name: string; displayName: string; xAccount: string },
        { updated: boolean }
      >(functions, "updateUserProfile")({
        name,
        displayName,
        xAccount,
      });
      alert("保存しました！");
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "functions/already-exists"
          ? "このXアカウントはすでに登録されています"
          : "保存に失敗しました。もう一度お試しください。";
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = "/";
  };

  if (loading) {
    return <LoadingState />;
  }

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "480px",
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      <h1 style={{ marginBottom: "20px" }}>プロフィール編集</h1>

      <p
        style={{
          background: "#f0f4ff",
          padding: "12px",
          borderRadius: "8px",
          fontSize: "14px",
          textAlign: "left",
          marginBottom: "20px",
        }}
      >
        ・「名前」は外部に表示されません。<br />
        ・「ニックネーム」は外部に表示される名前です。<br />
        ・ニックネームが空の場合は X アカウント名が表示されます。
      </p>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {/* 本名 */}
        <input
          type="text"
          placeholder="名前（外部非表示）"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />

        {/* ニックネーム */}
        <div style={{ width: "100%" }}>
          <input
            type="text"
            placeholder="ニックネーム（外部表示）"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={inputStyle}
          />

          {/* ★ 未入力なら警告 */}
          {!displayName.trim() && (
            <p style={{ color: "#dc2626", fontSize: 13, marginTop: 4, textAlign: "left" }}>
              ニックネームを入力してください
            </p>
          )}
        </div>

        {/* Xアカウント */}
        <div style={{ width: "100%" }}>
          <input
            type="text"
            placeholder="Xアカウント（@から）"
            value={xAccount}
            onChange={(e) => setXAccount(e.target.value)}
            disabled={xAccountConfirmed}
            style={{
              ...inputStyle,
              background: xAccountConfirmed ? "#e5e7eb" : "white",
              cursor: xAccountConfirmed ? "not-allowed" : "text",
            }}
          />

          {/* ★ 未入力なら警告 */}
          {!xAccount.trim() && (
            <p style={{ color: "#dc2626", fontSize: 13, marginTop: 4, textAlign: "left" }}>
              Xアカウントを入力してください
            </p>
          )}

          {/* ★ 確定済みなら注意文 */}
          {xAccountConfirmed && (
            <p
              style={{
                marginTop: "6px",
                fontSize: "13px",
                color: "#dc2626",
                textAlign: "left",
              }}
            >
              この X アカウントは管理者により確定されています。変更したい場合は管理者にご連絡ください。
            </p>
          )}
        </div>

        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: "12px",
            background: saving ? "#999" : "#4f46e5",
            color: "white",
            borderRadius: "8px",
            border: "none",
            fontSize: "18px",
            cursor: saving ? "not-allowed" : "pointer",
            marginTop: "10px",
          }}
        >
          {saving ? "保存中…" : "保存する"}
        </button>
      </div>

      {/* ログアウト */}
      <button
        onClick={handleLogout}
        style={{
          marginTop: "30px",
          padding: "12px 20px",
          background: "#ef4444",
          color: "white",
          borderRadius: "8px",
          border: "none",
          fontSize: "16px",
          cursor: "pointer",
        }}
      >
        ログアウト
      </button>
    </div>
  );
}

const inputStyle = {
  padding: "12px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  fontSize: "16px",
  width: "100%",
};
