"use client";

import { useState } from "react";
import { auth, db } from "@/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [xAccount, setXAccount] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async () => {
    if (!email || !password) {
      alert("メールアドレスとパスワードを入力してください");
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // ★ 一覧に確実に表示されるように必要なフィールドをすべて保存
      await setDoc(doc(db, "users", user.uid), {
        email,
        name,
        xAccount,
        points: 0,
        createdAt: new Date(),      // ← 一覧に必須
        lastLogin: new Date(),      // ← ログイン履歴用
        xAccountConfirmed: false,   // ← Xアカウント確認フラグ
      });

      alert("登録が完了しました！");
      router.push("/");
    } catch (error: any) {
      alert("登録に失敗しました：" + error.message);
    }

    setLoading(false);
  };

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "480px",
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      <h1 style={{ marginBottom: "20px" }}>新規登録</h1>

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
        <input
          type="text"
          placeholder="名前"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            padding: "12px",
            border: "1px solid #ccc",
            borderRadius: "8px",
            fontSize: "16px",
            width: "100%",
          }}
        />

        <input
          type="text"
          placeholder="Xアカウント（@から）"
          value={xAccount}
          onChange={(e) => setXAccount(e.target.value)}
          style={{
            padding: "12px",
            border: "1px solid #ccc",
            borderRadius: "8px",
            fontSize: "16px",
            width: "100%",
          }}
        />

        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            padding: "12px",
            border: "1px solid #ccc",
            borderRadius: "8px",
            fontSize: "16px",
            width: "100%",
          }}
        />

        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            padding: "12px",
            border: "1px solid #ccc",
            borderRadius: "8px",
            fontSize: "16px",
            width: "100%",
          }}
        />

        <button
          onClick={handleSignup}
          disabled={loading}
          style={{
            padding: "12px",
            background: loading ? "#999" : "#4f46e5",
            color: "white",
            borderRadius: "8px",
            border: "none",
            fontSize: "18px",
            cursor: loading ? "not-allowed" : "pointer",
            marginTop: "10px",
          }}
        >
          {loading ? "登録中…" : "登録する"}
        </button>
      </div>

      <p style={{ marginTop: "20px" }}>
        すでにアカウントをお持ちの方は{" "}
        <a href="/login" style={{ color: "#2563eb" }}>
          ログイン
        </a>
      </p>
    </div>
  );
}
