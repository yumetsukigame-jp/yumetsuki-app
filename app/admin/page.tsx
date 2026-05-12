"use client";

import { useEffect, useState } from "react";
import { auth, db, functions } from "@/firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

export default function AdminTopPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  const [dailyGachaTime, setDailyGachaTime] = useState<string | null>(null);
  const [dailyNibuichiTime, setDailyNibuichiTime] = useState<string | null>(
    null
  );

  const [running, setRunning] = useState(false);

  /* -----------------------------
     最新ログ取得
  ----------------------------- */
  const loadLogs = async () => {
    try {
      const q = query(
        collection(db, "systemLogs"),
        orderBy("executedAt", "desc"),
        limit(20)
      );
      const snap = await getDocs(q);

      let gacha = null;
      let nibuichi = null;

      snap.forEach((d) => {
        const data = d.data();

        const ts =
          data.executedAt?.toDate?.() instanceof Date
            ? data.executedAt.toDate()
            : null;

        if (!gacha && data.type === "dailyReset" && ts) {
          gacha = ts.toLocaleString();
        }
        if (!nibuichi && data.type === "nibuichiDailyReset" && ts) {
          nibuichi = ts.toLocaleString();
        }
      });

      setDailyGachaTime(gacha);
      setDailyNibuichiTime(nibuichi);
    } catch (e) {
      console.error("loadLogs error:", e);
    }
  };

  /* -----------------------------
     手動実行
  ----------------------------- */
  const runManual = async (type: "gacha" | "nibuichi") => {
    if (running) return;
    setRunning(true);

    try {
      if (type === "gacha") {
        const fn = httpsCallable(functions, "manualResetDailyGacha");
        await fn();
        alert("ガチャの手動リセットが完了しました");
      } else {
        const fn = httpsCallable(functions, "manualResetNibuichiDaily");
        await fn();
        alert("ニブイチの手動リセットが完了しました");
      }

      await loadLogs();
    } catch (e: any) {
      console.error("manual reset error:", e);
      alert("エラー: " + e.message);
    }

    setRunning(false);
  };

  /* -----------------------------
     認証チェック
  ----------------------------- */
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

      await loadLogs();
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
          自動更新ステータス
      ============================ */}
      <Section title="⏱ 自動更新ステータス">
        <div style={statusBox}>
          <p>ガチャ最終更新：{dailyGachaTime ?? "記録なし"}</p>
          <button
            onClick={() => runManual("gacha")}
            disabled={running}
            style={buttonStyle}
          >
            ガチャを手動リセット
          </button>
        </div>

        <div style={statusBox}>
          <p>ニブイチ最終更新：{dailyNibuichiTime ?? "記録なし"}</p>
          <button
            onClick={() => runManual("nibuichi")}
            disabled={running}
            style={buttonStyle}
          >
            ニブイチを手動リセット
          </button>
        </div>
      </Section>

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
          ニブイチ管理カテゴリ
      ============================ */}
      <Section title="🎯 ニブイチ管理">
        <MenuLink href="/admin/nibuichi">ニブイチ管理トップ</MenuLink>
        <MenuLink href="/admin/nibuichi/edit-stats">総合戦績の修正</MenuLink>
        <MenuLink href="/admin/nibuichi/history">日別履歴 & 予想一覧</MenuLink>
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

/* ------------------------------
   スタイル
------------------------------ */
const statusBox = {
  padding: "12px",
  background: "#f3f4f6",
  borderRadius: "8px",
  border: "1px solid #ddd",
};

const buttonStyle = {
  marginTop: "8px",
  padding: "8px 12px",
  background: "#2563eb",
  color: "white",
  borderRadius: "6px",
  border: "none",
  cursor: "pointer",
};
