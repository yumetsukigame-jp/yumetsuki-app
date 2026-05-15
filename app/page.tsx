"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { db, auth } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

export default function Home() {
  const [points, setPoints] = useState<number | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  const [xAccount, setXAccount] = useState<string | null>(null);
  const [subscriber, setSubscriber] = useState<boolean>(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  // ★ 今日のニブイチ
  const [todayPrediction, setTodayPrediction] = useState<string | null>(null);
  const [todayResult, setTodayResult] = useState<string | null>(null);

  // ★ 全体戦績
  const [totalBattle, setTotalBattle] = useState(0);
  const [totalWin, setTotalWin] = useState(0);
  const [totalDraw, setTotalDraw] = useState(0);
  const [totalLose, setTotalLose] = useState(0);
  const [totalBakuado, setTotalBakuado] = useState(0);

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

      // ★ JST 今日
      const today = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
      )
        .toISOString()
        .slice(0, 10);

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
        setNickname(data.displayName || "名無し");
        setXAccount(data.xAccount || null);
        setSubscriber(data.subscriber === true);
      } else {
        setPoints(0);
        setNickname("名無し");
        setXAccount(null);
        setSubscriber(false);
      }

      // ★ 今日のニブイチ予想（JST）
      const predRef = doc(db, "nibuichi_user_predictions", `${uid}_${today}`);
      const predSnap = await getDoc(predRef);
      if (predSnap.exists()) {
        setTodayPrediction(predSnap.data().prediction);
      }

      // ★ 今日の結果（JST）
      const resultRef = doc(db, "nibuichi_global", today);
      const resultSnap = await getDoc(resultRef);
      if (resultSnap.exists()) {
        setTodayResult(resultSnap.data().result);
      }

      // ★ 全体戦績
      const statsRef = doc(db, "nibuichi_global_stats", "stats");
      const statsSnap = await getDoc(statsRef);

      if (statsSnap.exists()) {
        const s = statsSnap.data();
        const win = s.win ?? 0;
        const draw = s.draw ?? 0;
        const lose = s.lose ?? 0;
        const bakuado = s.bakuado ?? 0;

        setTotalWin(win);
        setTotalDraw(draw);
        setTotalLose(lose);
        setTotalBakuado(bakuado);
        setTotalBattle(win + draw + lose + bakuado);
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

  // ★ 今日のニブイチ表示文言
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

      {/* ★ サブスクバッジ */}
      {subscriber && (
        <div
          style={{
            background: "#facc15",
            color: "#78350f",
            padding: "6px 12px",
            borderRadius: "8px",
            fontWeight: "bold",
            display: "inline-block",
            marginBottom: "10px",
          }}
        >
          ★ サブスクライバー
        </div>
      )}

      {/* ★ 名前表示 */}
      <h2 style={{ marginBottom: "10px" }}>
        {nickname}
        {xAccount && <span style={{ color: "#555" }}>（{xAccount}）</span>}
      </h2>

      <h1 style={{ fontSize: "26px", marginBottom: "20px" }}>
        現在のポイント：
        <span style={{ fontWeight: "bold" }}>
          {points === null ? "読み込み中…" : `${points} pt`}
        </span>
      </h1>

      {/* 🟡 今日のニブイチ */}
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

        {/* ★ 全体戦績 */}
        <div
          style={{
            marginTop: "12px",
            padding: "12px",
            background: "#fef3c7",
            borderRadius: "8px",
            fontSize: "16px",
            textAlign: "center",
            fontWeight: "bold",
          }}
        >
          【現戦績】{totalBattle}戦
          ({totalWin}勝/{totalDraw}分/{totalLose}負/{totalBakuado}爆アド)
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

      {/* 🟣 ガチャ */}
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

      {/* 🔵 ポイント */}
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

      {/* 🟢 アカウント */}
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
