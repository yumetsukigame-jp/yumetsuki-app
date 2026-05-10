"use client";

export const dynamic = "force-dynamic"; // ← SSR を完全に無効化

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

      // ユーザーデータ取得
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
        maxWidth: "480px",
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      <img
        src="/whiteMageGirl.webp"
        alt="white mage girl"
        style={{
          width: "70%",
          margin: "0 auto 20px",
          display: "block",
        }}
      />

      <h2 style={{ marginBottom: "10px" }}>ようこそ ゆめつきの書斎へ</h2>

      {xAccount && (
        <p style={{ fontSize: "18px", color: "#444", marginBottom: "10px" }}>
          X アカウント：{xAccount}
        </p>
      )}

      <h1 style={{ fontSize: "26px", marginBottom: "20px" }}>
        現在のポイント：
        <span style={{ fontWeight: "bold" }}>
          {points === null ? "読み込み中…" : `${points} pt`}
        </span>
      </h1>

      {/* メニュー */}
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
        <a href="/code" style={menuStyle}>コード入力でポイント獲得</a>
        <a href="/reward" style={menuStyle}>発送物を選ぶ</a>
        <a href="/history" style={menuStyle}>発送履歴を見る</a>
        <a href="/gacha" style={menuStyle}>ガチャを引く</a>
        <a href="/archive" style={menuStyle}>書庫を見る</a>
        <a href="/profile" style={menuStyle}>プロフィールを編集する</a>
      </div>

      <div
        style={{
          marginTop: "40px",
          paddingTop: "20px",
          borderTop: "1px solid #ddd",
        }}
      >
        {isAdmin ? (
          <a href="/admin" style={{ color: "#2563eb", fontSize: "18px" }}>
            管理者トップへ
          </a>
        ) : (
          <a href="/admin/login" style={{ color: "#2563eb", fontSize: "18px" }}>
            管理者ログイン
          </a>
        )}
      </div>
    </div>
  );
}

const menuStyle = {
  padding: "12px",
  background: "#4f46e5",
  color: "white",
  borderRadius: "8px",
  textDecoration: "none",
  fontSize: "18px",
  fontWeight: "bold",
};
