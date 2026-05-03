"use client";

import { useEffect, useState } from "react";
import { db, auth } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

export default function Home() {
  const [points, setPoints] = useState<number | null>(null);
  const [xAccount, setXAccount] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoggedIn(false);
        setLoading(false);
        return;
      }

      setLoggedIn(true);

      const uid = user.uid;

      // 管理者判定
      const adminRef = doc(db, "admins", uid);
      const adminSnap = await getDoc(adminRef);
      setIsAdmin(adminSnap.exists());

      // ユーザーデータ取得（ポイント・Xアカウント）
      const ref = doc(db, "users", uid);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data();
        setPoints(data.points || 0);
        setXAccount(data.xAccount || null);
      } else {
        setPoints(0);
        setXAccount(null);
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) {
    return <div style={{ padding: 20 }}>読み込み中…</div>;
  }

  if (!loggedIn) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <p>ログインしていません。</p>
        <a href="/login" style={{ color: "#2563eb" }}>ログインページへ</a>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "20px",
        textAlign: "center",
        maxWidth: "480px",
        margin: "0 auto",
      }}
    >
      {/* ★ 画像を完全中央寄せ */}
      <img
        src="/whiteMageGirl.png"
        alt="white mage girl"
        style={{
          width: "70%",
          margin: "0 auto 20px",
          display: "block",   // ← これが中央寄せの決め手
        }}
      />

      <h2>ようこそゆめつきの書斎へ</h2>

      {/* X アカウント表示 */}
      {xAccount && (
        <p style={{ marginTop: "8px", fontSize: "18px", color: "#444" }}>
          X アカウント：{xAccount}
        </p>
      )}

      <h1 style={{ fontSize: "28px", marginTop: "10px" }}>
        現在のポイント：
        <span style={{ fontWeight: "bold" }}>
          {points === null ? "読み込み中…" : `${points} pt`}
        </span>
      </h1>

      {/* メインメニュー */}
      <div
        style={{
          marginTop: "30px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <a
          href="/code"
          style={{
            padding: "12px",
            background: "#4f46e5",
            color: "white",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "18px",
          }}
        >
          コード入力でポイント獲得
        </a>

        <a
          href="/reward"
          style={{
            padding: "12px",
            background: "#e5e7eb",
            color: "#111",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "18px",
          }}
        >
          発送物を選ぶ
        </a>

        <a
          href="/history"
          style={{
            padding: "12px",
            background: "#e5e7eb",
            color: "#111",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "18px",
          }}
        >
          発送履歴を見る
        </a>

        <a
          href="/profile"
          style={{
            padding: "12px",
            background: "#e5e7eb",
            color: "#111",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "18px",
          }}
        >
          プロフィールを編集する
        </a>
      </div>

      {/* 管理者リンク */}
      <div
        style={{
          marginTop: "50px",
          paddingTop: "20px",
          borderTop: "1px solid #ddd",
          textAlign: "center",
        }}
      >
        {isAdmin ? (
          <a
            href="/admin"
            style={{ color: "#2563eb", textDecoration: "none" }}
          >
            管理者トップへ
          </a>
        ) : (
          <a
            href="/admin/login"
            style={{ color: "#2563eb", textDecoration: "none" }}
          >
            管理者ログイン
          </a>
        )}
      </div>
    </div>
  );
}
