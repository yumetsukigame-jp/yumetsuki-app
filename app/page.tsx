"use client";

import { useEffect, useState } from "react";
import { db, auth } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

export default function Home() {
  const [points, setPoints] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // ★ auth.currentUser ではなく onAuthStateChanged を使う
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

      // ユーザーポイント取得
      const ref = doc(db, "users", uid);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        setPoints(snap.data().points || 0);
      } else {
        setPoints(0);
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
      <img
        src="/whiteMageGirl.png"
        alt="white mage girl"
        style={{ width: "70%", marginBottom: "20px" }}
      />

      <h2>こんにちは</h2>

      <h1 style={{ fontSize: "28px", marginTop: "10px" }}>
        現在のポイント：
        <span style={{ fontWeight: "bold" }}>
          {points === null ? "読み込み中…" : `${points} pt`}
        </span>
      </h1>

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
      </div>

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