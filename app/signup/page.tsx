"use client";

import { useState } from "react";
import { auth, functions } from "@/firebase";
import { createUserWithEmailAndPassword, type User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(""); // 本名（外部非表示）
  const [displayName, setDisplayName] = useState(""); // ニックネーム（外部表示）
  const [xAccount, setXAccount] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async () => {
    // ★ 必須チェック（すべて必須）
    if (!name || !displayName || !xAccount || !email || !password) {
      alert("すべての項目を入力してください");
      return;
    }

    // Xアカウントは @ から始まる必要がある
    if (!xAccount.startsWith("@")) {
      alert("Xアカウントは @ から入力してください");
      return;
    }

    setLoading(true);

    let createdUser: User | undefined;
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;
      createdUser = user;

      await httpsCallable<
        { name: string; displayName: string; xAccount: string },
        { created: boolean }
      >(functions, "createUserProfile")({
        name,
        displayName,
        xAccount,
      });

      alert("登録が完了しました！");
      router.push("/");
    } catch (error) {
      const isDuplicateXAccount =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "functions/already-exists";
      if (isDuplicateXAccount && createdUser) {
        try {
          await createdUser.delete();
        } catch (deleteError) {
          console.error("重複登録後の認証ユーザー削除に失敗しました", deleteError);
        }
      }

      const message =
        isDuplicateXAccount
          ? "このXアカウントはすでに登録されています"
          : "登録に失敗しました。もう一度お試しください。";
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "480px", margin: "0 auto", textAlign: "center" }}>
      <h1 style={{ marginBottom: "20px" }}>新規登録</h1>

      <p style={{
        background: "#f0f4ff",
        padding: "12px",
        borderRadius: "8px",
        fontSize: "14px",
        textAlign: "left",
        marginBottom: "20px",
      }}>
        ・「名前」は外部に表示されません。<br />
        ・「ニックネーム」は外部に表示される名前です。<br />
        ・ニックネームが空の場合は X アカウント名が表示されます。
      </p>

      <div style={{
        background: "white",
        padding: "20px",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}>
        <input type="text" placeholder="名前（外部非表示）" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        <input type="text" placeholder="ニックネーム（外部表示）" value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} />
        <input type="text" placeholder="Xアカウント（@から）" value={xAccount} onChange={(e) => setXAccount(e.target.value)} style={inputStyle} />
        <input type="email" placeholder="メールアドレス" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        <input type="password" placeholder="パスワード" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />

        <button onClick={handleSignup} disabled={loading} style={{
          padding: "12px",
          background: loading ? "#999" : "#4f46e5",
          color: "white",
          borderRadius: "8px",
          border: "none",
          fontSize: "18px",
          cursor: loading ? "not-allowed" : "pointer",
          marginTop: "10px",
        }}>
          {loading ? "登録中…" : "登録する"}
        </button>
      </div>

      <p style={{ marginTop: "20px" }}>
        すでにアカウントをお持ちの方は{" "}
        <Link href="/login" style={{ color: "#2563eb" }}>
          ログイン
        </Link>
      </p>
      <p style={{ marginTop: "12px" }}>
        <Link href="/guide" style={{ color: "#2563eb" }}>
          ゆめつきの書斎の使い方を見る
        </Link>
      </p>
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
