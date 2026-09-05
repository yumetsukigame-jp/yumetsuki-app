"use client";

import { useEffect, useState } from "react";
import { auth, db, functions } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signOut,
  updateEmail,
  updatePassword,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import LoadingState from "@/app/components/LoadingState";
import { withRetry } from "@/app/lib/retry";

export default function ProfilePage() {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [xAccount, setXAccount] = useState("");
  const [xAccountConfirmed, setXAccountConfirmed] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingEmail, setUpdatingEmail] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      setAccountEmail(user.email ?? "");
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

  const reauthenticate = async () => {
    const user = auth.currentUser;
    if (!user?.email) {
      throw new Error("メールアドレスの確認に失敗しました。再度ログインしてください。");
    }

    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    return user;
  };

  const handleUpdateEmail = async () => {
    if (updatingEmail) return;

    const email = newEmail.trim();
    if (!currentPassword || !email) {
      alert("現在のパスワードと新しいメールアドレスを入力してください。");
      return;
    }

    setUpdatingEmail(true);
    try {
      const user = await reauthenticate();
      await updateEmail(user, email);
      await httpsCallable<undefined, { updated: boolean; email: string }>(
        functions,
        "syncUserEmail"
      )();
      setAccountEmail(email);
      setNewEmail("");
      setCurrentPassword("");
      alert("メールアドレスを変更しました。");
    } catch (error) {
      console.error("メールアドレスの変更に失敗しました", error);
      alert(getAccountUpdateErrorMessage(error));
    } finally {
      setUpdatingEmail(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (updatingPassword) return;

    if (!currentPassword || !newPassword || !passwordConfirmation) {
      alert("現在のパスワードと新しいパスワードを入力してください。");
      return;
    }

    if (newPassword !== passwordConfirmation) {
      alert("新しいパスワードが一致しません。");
      return;
    }

    setUpdatingPassword(true);
    try {
      const user = await reauthenticate();
      await updatePassword(user, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordConfirmation("");
      alert("パスワードを変更しました。");
    } catch (error) {
      console.error("パスワードの変更に失敗しました", error);
      alert(getAccountUpdateErrorMessage(error));
    } finally {
      setUpdatingPassword(false);
    }
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

      <section
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          marginTop: "24px",
          textAlign: "left",
        }}
      >
        <h2 style={{ fontSize: "20px", margin: "0 0 8px" }}>ログイン情報の変更</h2>
        <p style={{ margin: "0 0 16px", fontSize: "14px", color: "#4b5563" }}>
          現在のメールアドレス：{accountEmail || "未設定"}
        </p>

        <input
          type="password"
          autoComplete="current-password"
          placeholder="現在のパスワード"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          style={{ ...inputStyle, marginBottom: "12px" }}
        />

        <input
          type="email"
          autoComplete="email"
          placeholder="新しいメールアドレス"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          style={{ ...inputStyle, marginBottom: "12px" }}
        />
        <button
          onClick={handleUpdateEmail}
          disabled={updatingEmail}
          style={accountButtonStyle(updatingEmail)}
        >
          {updatingEmail ? "メールアドレスを変更中…" : "メールアドレスを変更する"}
        </button>

        <hr style={{ border: 0, borderTop: "1px solid #e5e7eb", margin: "24px 0" }} />

        <input
          type="password"
          autoComplete="new-password"
          placeholder="新しいパスワード（6文字以上）"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          style={{ ...inputStyle, marginBottom: "12px" }}
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="新しいパスワード（確認）"
          value={passwordConfirmation}
          onChange={(e) => setPasswordConfirmation(e.target.value)}
          style={{ ...inputStyle, marginBottom: "12px" }}
        />
        <button
          onClick={handleUpdatePassword}
          disabled={updatingPassword}
          style={accountButtonStyle(updatingPassword)}
        >
          {updatingPassword ? "パスワードを変更中…" : "パスワードを変更する"}
        </button>
      </section>

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

function accountButtonStyle(disabled: boolean) {
  return {
    width: "100%",
    padding: "12px",
    background: disabled ? "#9ca3af" : "#4f46e5",
    color: "white",
    borderRadius: "8px",
    border: "none",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function getAccountUpdateErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : "";

  switch (code) {
    case "auth/wrong-password":
      return "現在のパスワードが正しくありません。";
    case "auth/invalid-credential":
      return "現在のパスワードが正しくありません。";
    case "auth/email-already-in-use":
      return "このメールアドレスはすでに使用されています。";
    case "auth/invalid-email":
      return "メールアドレスの形式が正しくありません。";
    case "auth/weak-password":
      return "新しいパスワードは6文字以上で設定してください。";
    case "auth/requires-recent-login":
      return "安全のため、いったんログアウトしてから再度ログインしてください。";
    default:
      return "変更に失敗しました。もう一度お試しください。";
  }
}
