"use client";

import { useState } from "react";
import { auth } from "@/firebase";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/");
    } catch (error) {
      console.error(error);
      setMessage("ログインに失敗しました");
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setMessage("パスワード再発行にはメールアドレスを入力してください");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage("パスワード再設定メールを送信しました");
    } catch (error) {
      console.error(error);
      setMessage("メール送信に失敗しました");
    }
  };

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "420px",
        margin: "0 auto",
        marginTop: "40px",
      }}
    >
      {/* カード */}
      <div
        style={{
          background: "white",
          padding: "30px",
          borderRadius: "12px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
        }}
      >
        <h1 style={{ textAlign: "center", marginBottom: "20px" }}>ログイン</h1>

        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: "100%",
            padding: "12px",
            marginBottom: "12px",
            borderRadius: "8px",
            border: "1px solid #ccc",
            fontSize: "16px",
          }}
        />

        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%",
            padding: "12px",
            marginBottom: "16px",
            borderRadius: "8px",
            border: "1px solid #ccc",
            fontSize: "16px",
          }}
        />

        {/* ログインボタン */}
        <button
          onClick={handleLogin}
          style={{
            width: "100%",
            padding: "12px",
            background: "#4f46e5",
            color: "white",
            borderRadius: "8px",
            fontSize: "16px",
            fontWeight: "bold",
            marginBottom: "12px",
          }}
        >
          ログイン
        </button>

        {/* ★ パスワード再発行ボタン（メインカラーに統一） */}
        <button
          onClick={handleResetPassword}
          style={{
            width: "100%",
            padding: "10px",
            background: "#4f46e5",   // ← メインカラーに統一
            color: "white",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: "bold",
          }}
        >
          パスワードを忘れた方はこちら
        </button>

        {message && (
          <p
            style={{
              marginTop: "15px",
              color: "red",
              textAlign: "center",
              fontWeight: "bold",
            }}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
