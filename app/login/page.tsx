"use client";

import { useState } from "react";
import { auth, db } from "@/firebase";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, getDocFromServer } from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [accountCheckFailed, setAccountCheckFailed] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (loading) return;

    setLoading(true);
    setMessage("");
    setAccountCheckFailed(false);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // キャッシュではなくサーバーの最新データでアカウント情報を確認する
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDocFromServer(userRef);

      if (!userSnap.exists()) {
        setAccountCheckFailed(true);
        setMessage(
          "アカウント情報の読み込みに時間がかかっています。数秒待ってから再度ログインするか、トップページへ移動してください。"
        );
        return;
      }

      const userData = userSnap.data();

      // ★ displayName が未設定ならプロフィール設定へ誘導
      if (!userData.displayName || userData.displayName.trim() === "") {
        alert("ニックネームが未設定です。プロフィールを設定してください。");
        router.push("/profile");
        return;
      }

      // 通常ログイン
      router.push("/");

    } catch (error) {
      console.error(error);
      setMessage("ログインに失敗しました");
    } finally {
      setLoading(false);
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
        textAlign: "center",
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
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px",
            background: loading ? "#999" : "#4f46e5",
            color: "white",
            borderRadius: "8px",
            fontSize: "16px",
            fontWeight: "bold",
            marginBottom: "12px",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "ログイン中…" : "ログイン"}
        </button>

        {/* パスワード再発行 */}
        <button
          onClick={handleResetPassword}
          style={{
            width: "100%",
            padding: "10px",
            background: "#4f46e5",
            color: "white",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: "bold",
            marginBottom: "12px",
          }}
        >
          パスワードを忘れた方はこちら
        </button>

        {/* 新規登録 */}
        <button
          onClick={() => router.push("/signup")}
          style={{
            width: "100%",
            padding: "10px",
            background: "#4f46e5",
            color: "white",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: "bold",
          }}
        >
          新規登録はこちら
        </button>

        {message && (
          <>
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
            {accountCheckFailed && (
              <button
                onClick={() => router.push("/")}
                style={{
                  width: "100%",
                  padding: "10px",
                  background: "#4f46e5",
                  color: "white",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "14px",
                  fontWeight: "bold",
                  marginTop: "12px",
                }}
              >
                トップページへ
              </button>
            )}
          </>
        )}
      </div>

      {/* ▼ ゆめつき本舗リンク（ログインしていなくても表示） */}
      <div style={{ marginTop: 40, textAlign: "center" }}>
        <a
          href="https://yumetsuki.base.shop"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-block" }}
        >
          <img
            src="/honpo.webp"
            alt="ゆめつき本舗HPはこちら"
            style={{
              width: "100%",
              maxWidth: 320,
              borderRadius: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              cursor: "pointer",
            }}
          />
        </a>

        <p style={{ marginTop: 8, fontWeight: "bold" }}>
          ゆめつき本舗HPはこちら
        </p>
      </div>
    </div>
  );
}
