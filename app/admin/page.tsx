"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

export default function AdminTopPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/admin/login");
        return;
      }

      const uid = user.uid;
      const adminRef = doc(db, "admins", uid);
      const adminSnap = await getDoc(adminRef);

      if (!adminSnap.exists()) {
        router.push("/");
        return;
      }

      setIsAdmin(true);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) return <p style={{ textAlign: "center" }}>読み込み中…</p>;

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "600px",
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      <h1>管理者トップページ</h1>

      <div
        style={{
          marginTop: "30px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <a href="/admin/users" style={linkStyle}>ユーザー管理</a>
        <a href="/admin/codes" style={linkStyle}>コード一覧</a>
        <a href="/admin/create-code" style={linkStyle}>新しいコードを発行</a>
        <a href="/admin/history" style={linkStyle}>ポイント履歴</a>

        <a href="/admin/rewards" style={linkStyle}>発送物一覧</a>
        <a href="/admin/rewards/add" style={linkStyle}>発送物を作成</a>
        <a href="/admin/shipping" style={linkStyle}>発送管理（発送物確認）</a>
        <a href="/admin/shipping/history" style={linkStyle}>発送履歴</a>
        <a href="/admin/shipping/stats" style={linkStyle}>発送数集計</a>
      </div>

      <div
        style={{
          marginTop: "50px",
          paddingTop: "20px",
          borderTop: "1px solid #ddd",
        }}
      >
        <a href="/" style={{ color: "#2563eb", textDecoration: "none" }}>
          ユーザートップへ戻る
        </a>
      </div>
    </div>
  );
}

const linkStyle = {
  padding: "12px",
  background: "#2563eb",
  color: "white",
  borderRadius: "8px",
  textDecoration: "none",
  fontSize: "18px",
};
