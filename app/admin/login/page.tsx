"use client";

import { useState } from "react";
import { auth } from "@/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import Link from "next/link";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);

      window.location.assign("/admin");
    } catch (err) {
      console.error("管理者ログインに失敗しました", err);
      setError("ログインに失敗しました。メールまたはパスワードを確認してください。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "400px",
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      <h1>管理者ログイン</h1>

      <form onSubmit={handleLogin} style={{ marginTop: "20px" }}>
        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{
            width: "100%",
            padding: "10px",
            marginBottom: "10px",
            borderRadius: "6px",
            border: "1px solid #ccc",
          }}
        />

        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{
            width: "100%",
            padding: "10px",
            marginBottom: "10px",
            borderRadius: "6px",
            border: "1px solid #ccc",
          }}
        />

        {error && (
          <p style={{ color: "red", marginBottom: "10px" }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px",
            background: "#2563eb",
            color: "white",
            borderRadius: "8px",
            border: "none",
            fontSize: "16px",
            opacity: loading ? 0.6 : 1,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "ログイン中…" : "ログイン"}
        </button>
      </form>

      {/* ★ トップページへ戻るリンク */}
      <div style={{ marginTop: "30px" }}>
        <Link
          href="/"
          style={{
            color: "#2563eb",
            textDecoration: "none",
            fontSize: "16px",
          }}
        >
          トップページへ戻る
        </Link>
      </div>
    </div>
  );
}
