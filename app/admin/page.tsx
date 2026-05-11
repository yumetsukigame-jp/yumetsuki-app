"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

export default function AdminTopPage() {
  const router = useRouter();
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

      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) return <p style={{ textAlign: "center" }}>読み込み中…</p>;

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "700px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ textAlign: "center" }}>管理者トップページ</h1>

      {/* ============================
          ユーザー管理カテゴリ
      ============================ */}
      <Section title="👤 ユーザー管理">
        <MenuLink href="/admin/users">ユーザー管理</MenuLink>
        <MenuLink href="/admin/history">ポイント履歴</MenuLink>
      </Section>

      {/* ============================
          コード管理カテゴリ
      ============================ */}
      <Section title="🔑 コード管理">
        <MenuLink href="/admin/codes">コード一覧</MenuLink>
        <MenuLink href="/admin/create-code">新しいコードを発行</MenuLink>
      </Section>

      {/* ============================
          ガチャ管理カテゴリ
      ============================ */}
      <Section title="🎰 ガチャ管理">
        <MenuLink href="/admin/gacha">ガチャコード発行</MenuLink>
        <MenuLink href="/admin/gacha/manage">ガチャ管理（一覧・編集）</MenuLink>
        <MenuLink href="/admin/gacha/results">ガチャ結果一覧</MenuLink>
      </Section>

      {/* ============================
          発送管理カテゴリ
      ============================ */}
      <Section title="📦 発送管理">
        <MenuLink href="/admin/rewards">発送物一覧</MenuLink>
        <MenuLink href="/admin/rewards/add">発送物を作成</MenuLink>
        <MenuLink href="/admin/shipping">発送管理（発送物確認）</MenuLink>
        <MenuLink href="/admin/shipping/history">発送履歴</MenuLink>
        <MenuLink href="/admin/shipping/stats">発送数集計</MenuLink>
      </Section>

      {/* ============================
          ニブイチ管理カテゴリ（追加）
      ============================ */}
      <Section title="🎯 ニブイチ管理">
        <MenuLink href="/admin/nibuichi">ニブイチ管理トップ</MenuLink>
        <MenuLink href="/admin/nibuichi/result">今日の結果入力</MenuLink>
        <MenuLink href="/admin/nibuichi/users">ユーザー予想一覧</MenuLink>
        <MenuLink href="/admin/nibuichi/history">日別履歴</MenuLink>
      </Section>

      {/* ============================
          戻る
      ============================ */}
      <div
        style={{
          marginTop: "40px",
          textAlign: "center",
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

/* ------------------------------
   セクションコンポーネント
------------------------------ */
function Section({ title, children }) {
  return (
    <div style={{ marginTop: "32px" }}>
      <h2
        style={{
          marginBottom: "12px",
          borderLeft: "6px solid #2563eb",
          paddingLeft: "10px",
        }}
      >
        {title}
      </h2>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------------
   メニューリンク
------------------------------ */
function MenuLink({ href, children }) {
  return (
    <a
      href={href}
      style={{
        padding: "12px",
        background: "#2563eb",
        color: "white",
        borderRadius: "8px",
        textDecoration: "none",
        fontSize: "18px",
        textAlign: "center",
      }}
    >
      {children}
    </a>
  );
}
