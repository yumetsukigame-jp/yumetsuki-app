"use client";

import React, { useEffect, useState } from "react";
export const dynamic = "force-dynamic";

import { db, auth } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

/* --------------------------------------------------
   JST 6時切り替えの今日の日付
-------------------------------------------------- */
function getTodayJST6() {
  const jst = new Date();
  const cutoff = new Date(jst);
  cutoff.setHours(6, 0, 0, 0);

  if (jst < cutoff) {
    jst.setDate(jst.getDate() - 1);
  }

  const y = jst.getFullYear();
  const m = String(jst.getMonth() + 1).padStart(2, "0");
  const d = String(jst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function Home() {
  /* --------------------------------------------------
     Auth 状態
  -------------------------------------------------- */
  const [uid, setUid] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  /* --------------------------------------------------
     Firestore データ
  -------------------------------------------------- */
  const [points, setPoints] = useState<number | undefined>(undefined);
  const [nickname, setNickname] = useState<string | undefined>(undefined);
  const [xAccount, setXAccount] = useState<string | undefined>(undefined);
  const [subscriber, setSubscriber] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [todayPrediction, setTodayPrediction] = useState<string | null>(null);
  const [todayResult, setTodayResult] = useState<string | null>(null);

  const [totalBattle, setTotalBattle] = useState(0);
  const [totalWin, setTotalWin] = useState(0);
  const [totalDraw, setTotalDraw] = useState(0);
  const [totalLose, setTotalLose] = useState(0);
  const [totalBakuado, setTotalBakuado] = useState(0);

  /* --------------------------------------------------
     ① Auth 初期化（未ログインなら即ログイン画面へ）
  -------------------------------------------------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUid(user.uid);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  /* --------------------------------------------------
     ② uid が変わったら nickname をリセット
  -------------------------------------------------- */
  useEffect(() => {
    setNickname(undefined);
    setPoints(undefined);
  }, [uid]);

  /* --------------------------------------------------
     ③ Firestore 読み込み
  -------------------------------------------------- */
  useEffect(() => {
    if (!authReady) return;
    if (!uid) return;

    const load = async () => {
      const today = getTodayJST6();

      /* --- 管理者判定 --- */
      const adminSnap = await getDoc(doc(db, "admins", uid));
      setIsAdmin(adminSnap.exists());

      /* --- ユーザーデータ --- */
      const userSnap = await getDoc(doc(db, "users", uid));
      if (userSnap.exists()) {
        const u = userSnap.data();

        if (!u.displayName || u.displayName.trim() === "") {
          setNickname(undefined);
        } else {
          setNickname(u.displayName);
        }

        setPoints(u.points ?? 0);
        setXAccount(u.xAccount ?? undefined);
        setSubscriber(u.subscriber === true);
      } else {
        setNickname(undefined);
      }

      /* --- 今日の予想 --- */
      const predSnap = await getDoc(
        doc(db, "nibuichi_user_predictions", `${uid}_${today}`)
      );
      if (predSnap.exists()) {
        setTodayPrediction(predSnap.data().prediction);
      }

      /* --- 今日の結果 --- */
      const resultSnap = await getDoc(doc(db, "nibuichi_global", today));
      if (resultSnap.exists()) {
        setTodayResult(resultSnap.data().result);
      }

      /* --- 全体戦績 --- */
      const statsSnap = await getDoc(doc(db, "nibuichi_global_stats", "stats"));
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
    };

    load();
  }, [authReady, uid]);

  /* --------------------------------------------------
     読み込み中
  -------------------------------------------------- */
  if (!authReady || !uid || nickname === undefined) {
    return (
      <div style={{ padding: 20, textAlign: "center" }}>
        読み込み中…
        <br />
        <a href="/login" style={{ color: "#2563eb" }}>
          ログインはこちら
        </a>
      </div>
    );
  }

  /* --------------------------------------------------
     ニブイチ表示
  -------------------------------------------------- */
  let nibuichiStatus = "未参加";

  if (todayPrediction && !todayResult) {
    nibuichiStatus = `${todayPrediction}（予想済）`;
  }

  if (todayPrediction && todayResult) {
    const hit = todayPrediction === todayResult;
    nibuichiStatus = `${todayPrediction} → 結果：${todayResult}（${
      hit ? "的中" : "ハズレ"
    }）`;
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

      <h2 style={{ marginBottom: "10px" }}>
        {nickname}
        {xAccount && <span style={{ color: "#555" }}>（{xAccount}）</span>}
      </h2>
{/* 現在のポイント */}
<h1 style={{ fontSize: "26px", marginBottom: "20px" }}>
  現在のポイント：
  <span style={{ fontWeight: "bold" }}>{points} pt</span>
</h1>

{/* ★★★ 戦績をここに常時表示 ★★★ */}
<div
  style={{
    background: "#fef9c3",
    padding: "10px",
    borderRadius: "8px",
    marginBottom: "20px",
    fontWeight: "bold",
    color: "#854d0e",
    textAlign: "center",
  }}
>
  <div style={{ marginBottom: "4px" }}>{nibuichiStatus}</div>
  <div>
    【現戦績】{totalBattle}戦（{totalWin}勝 / {totalDraw}分 / {totalLose}負 /{" "}
    {totalBakuado}爆アド）
  </div>
</div>

{/* 🎯 今日のニブイチ */}
<Section title="🎯 今日のニブイチ" color="#eab308">
  {/* ★ 初期表示は「参加ボタン」だけ */}
  <MenuButton href="/nibuichi" color="#eab308">
    今日のニブイチに参加する
  </MenuButton>

  {/* ★ 折りたたみ部分 */}
  <MenuButton href="/nibuichi/ranking" color="#eab308">
    ランキングを見る
  </MenuButton>
  <MenuButton href="/nibuichi/history" color="#eab308">
    自分の結果履歴を見る
  </MenuButton>
</Section>

      {/* 🎰 ガチャ */}
      <Section title="🎰 ガチャ" color="#a855f7">
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

      {/* 📦 ポイント */}
      <Section title="📦 ポイント関連" color="#2563eb">
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

      {/* 🧠 クイズ */}
      <Section title="クイズ" color="#0ea5e9" icon="🧠">
        <MenuButton href="/quizzes" color="#0ea5e9">
          クイズ一覧を見る
        </MenuButton>
        <MenuButton href="/quizzes/archive" color="#0ea5e9">
          完了済みクイズを見る
        </MenuButton>
        <MenuButton href="/quizzes/ranking" color="#0ea5e9">
          クイズランキングを見る
        </MenuButton>
      </Section>

      {/* 👤 アカウント */}
      <Section title="👤 アカウント" color="#16a34a" forceCollapseAll={true}>
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
function Section({ title, color, icon, children, forceCollapseAll = false }: any) {
  const [open, setOpen] = useState(false);

  const items = React.Children.toArray(children);
  const firstItem = items[0];
  const restItems = items.slice(1);

  const showFirst = !forceCollapseAll;

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
      {/* タイトル + 折り畳みボタン */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {icon && <span style={{ fontSize: "20px" }}>{icon}</span>}
          <h3 style={{ color, margin: 0 }}>{title}</h3>
        </div>

        {(forceCollapseAll || restItems.length > 0) && (
          <button
            onClick={() => setOpen(!open)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "16px",
              color,
              padding: "4px 8px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span style={{ fontSize: "20px" }}>{open ? "▲" : "▼"}</span>
            <span style={{ fontSize: "12px" }}>詳細メニュー表示</span>
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {showFirst && firstItem}
        {open && (forceCollapseAll ? items : restItems)}
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