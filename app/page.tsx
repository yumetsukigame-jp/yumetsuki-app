"use client";

export const dynamic = "force-dynamic";

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

  // ★ ニブイチ関連
  const [todayPrediction, setTodayPrediction] = useState<string | null>(null);
  const [todayResult, setTodayResult] = useState<string | null>(null);

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

      // ★ 今日のニブイチ予想取得
      const today = new Date().toISOString().slice(0, 10);
      const predRef = doc(db, "nibuichi_user_predictions", `${uid}_${today}`);
      const predSnap = await getDoc(predRef);

      if (predSnap.exists()) {
        setTodayPrediction(predSnap.data().prediction);
      }

      // ★ 今日の結果取得
      const resultRef = doc(db, "nibuichi_global", "today");
      const resultSnap = await getDoc(resultRef);

      if (resultSnap.exists()) {
        setTodayResult(resultSnap.data().result);
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

  // ★ ニブイチ表示文言
  let nibuichiStatus = "未参加";

  if (todayPrediction && !todayResult) {
    nibuichiStatus = `${todayPrediction}（確定済み）`;
  }

  if (todayPrediction && todayResult) {
    const hit = todayPrediction === todayResult;
    nibuichiStatus = `${todayPrediction} → 結果：${todayResult}（${hit ? "的中" : "ハズレ"}）`;
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

      {/* 🟡 今日のニブイチ参加状況 */}
      <Section title="今日のニブイチ" color="#eab308">
        <div
          style={{
            padding: "12px",
            background: "#fef9c3",
            borderRadius: "8px",
            fontSize: "18px",
            fontWeight: "bold",
            textAlign: "center",
          }}
        >
          {nibuichiStatus}
        </div>

        <MenuButton href="/nibuichi" color="#eab308">
          今日のニブイチに参加する
        </MenuButton>
        <MenuButton href="/nibuichi/ranking" color="#eab308">
          ランキングを見る
        </MenuButton>
        <MenuButton href="/nibuichi/history" color="#eab308">
          自分の結果履歴を見る
        </MenuButton>
      </Section>

      {/* 🔵 ポイント関連 */}
      <Section title="ポイント関連" color="#2563eb">
        <MenuButton href="/code" color="#2563eb">
          コード入力でポイント獲得
        </MenuButton>
        <MenuButton href="/reward" color="#2563eb">
          発送物を選ぶ
        </MenuButton>
        <MenuButton href="/history" color="#2563eb">
          発送履歴を見る
        </MenuButton>
      </Section>

      {/* 🟣 ガチャ関連 */}
      <Section title="ガチャ" color="#a855f7">
        <MenuButton href="/gacha/list" color="#a855f7">
          ガチャ一覧を見る
        </MenuButton>
        <MenuButton href="/gacha" color="#a855f7">
          ガチャを引く
        </MenuButton>
        <MenuButton href="/gacha/results" color="#a855f7">
          ガチャ結果を見る
        </MenuButton>
      </Section>

      {/* 🟢 アカウント関連 */}
      <Section title="アカウント" color="#16a34a">
        <MenuButton href="/archive" color="#16a34a">
          書庫を見る
        </MenuButton>
        <MenuButton href="/profile" color="#16a34a">
          プロフィールを編集する
        </MenuButton>
      </Section>

      {/* 🔴 管理者 */}
      <div
        style={{
          marginTop: "40px",
          paddingTop: "20px",
          borderTop: "1px solid #ddd",
        }}
      >
        {isAdmin ? (
          <a href="/admin" style={{ color: "#dc2626", fontSize: "18px" }}>
            管理者トップへ
          </a>
        ) : (
          <a href="/admin/login" style={{ color: "#dc2626", fontSize: "18px" }}>
            管理者ログイン
          </a>
        )}
      </div>
    </div>
  );
}

/* ------------------------------
   セクションコンポーネント
------------------------------ */
function Section({ title, color, children }: any) {
  return (
    <div
      style={{
        background: "white",
        padding: "16px",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        marginBottom: "24px",
        textAlign: "left",
      }}
    >
      <h3 style={{ color, marginBottom: "12px" }}>{title}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------
   メニューボタン
------------------------------ */
function MenuButton({ href, color, children }: any) {
  return (
    <a
      href={href}
      style={{
        padding: "12px",
        background: color,
        color: "white",
        borderRadius: "8px",
        textDecoration: "none",
        fontSize: "18px",
        fontWeight: "bold",
        textAlign: "center",
      }}
    >
      {children}
    </a>
  );
}
