"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function AdminTopPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      const user = auth.currentUser;

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
    };

    checkAdmin();
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
        {/* ★ ユーザー管理 */}
        <a
          href="/admin/users"
          style={{
            padding: "12px",
            background: "#2563eb",
            color: "white",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "18px",
          }}
        >
          ユーザー管理
        </a>

        {/* ★ コード一覧 */}
        <a
          href="/admin/codes"
          style={{
            padding: "12px",
            background: "#4f46e5",
            color: "white",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "18px",
          }}
        >
          コード一覧
        </a>

        {/* ★ コード発行 */}
        <a
          href="/admin/create-code"
          style={{
            padding: "12px",
            background: "#10b981",
            color: "white",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "18px",
          }}
        >
          新しいコードを発行
        </a>

        {/* ★ ポイント履歴 */}
        <a
          href="/admin/history"
          style={{
            padding: "12px",
            background: "#f59e0b",
            color: "white",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "18px",
          }}
        >
          ポイント履歴
        </a>

        {/* ★★★ 発送物メニュー追加 ★★★ */}

        <a
          href="/admin/rewards"
          style={{
            padding: "12px",
            background: "#3b82f6",
            color: "white",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "18px",
          }}
        >
          発送物一覧
        </a>

        <a
          href="/admin/rewards/add"
          style={{
            padding: "12px",
            background: "#2563eb",
            color: "white",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "18px",
          }}
        >
          発送物を作成
        </a>

        <a
          href="/admin/shipping"
          style={{
            padding: "12px",
            background: "#059669",
            color: "white",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "18px",
          }}
        >
          発送管理（発送物確認）
        </a>

        <a
          href="/admin/shipping/history"
          style={{
            padding: "12px",
            background: "#047857",
            color: "white",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "18px",
          }}
        >
          発送履歴
        </a>

        <a
          href="/admin/shipping/stats"
          style={{
            padding: "12px",
            background: "#0ea5e9",
            color: "white",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "18px",
          }}
        >
          発送数集計
        </a>
      </div>

      {/* ★ ユーザートップへ戻る */}
      <div
        style={{
          marginTop: "50px",
          paddingTop: "20px",
          borderTop: "1px solid #ddd",
        }}
      >
        <a
          href="/"
          style={{
            color: "#2563eb",
            textDecoration: "none",
            fontSize: "16px",
          }}
        >
          ユーザートップへ戻る
        </a>
      </div>
    </div>
  );
}
