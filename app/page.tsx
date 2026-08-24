"use client";

import React, { useEffect, useState } from "react";
export const dynamic = "force-dynamic";

import { db, auth } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import Link from "next/link";
import LoadingState from "@/app/components/LoadingState";
import { withRetry } from "@/app/lib/retry";

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

type CachedUser = {
  uid: string;
  nickname: string;
  points: number;
  xAccount?: string;
  subscriber: boolean;
};

function getCachedUser(): CachedUser | null {
  if (typeof window === "undefined") return null;

  try {
    const value = sessionStorage.getItem("home-user");
    return value ? (JSON.parse(value) as CachedUser) : null;
  } catch {
    return null;
  }
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
  const [todayPrediction, setTodayPrediction] = useState<string | null>(null);
  const [todayResult, setTodayResult] = useState<string | null>(null);

  const [totalBattle, setTotalBattle] = useState(0);
  const [totalWin, setTotalWin] = useState(0);
  const [totalDraw, setTotalDraw] = useState(0);
  const [totalLose, setTotalLose] = useState(0);
  const [totalBakuado, setTotalBakuado] = useState(0);
  const [nibuichiLoaded, setNibuichiLoaded] = useState(false);

  /* --------------------------------------------------
     ① Auth 初期化（未ログインなら即ログイン画面へ）
  -------------------------------------------------- */
  useEffect(() => {
    const cached = getCachedUser();
    const cacheTimer = window.setTimeout(() => {
      if (!cached) return;
      setUid((currentUid) => currentUid ?? cached.uid);
      setAuthReady((currentReady) => currentReady || cached.uid.length > 0);
      setNickname((currentNickname) => currentNickname ?? cached.nickname);
      setPoints((currentPoints) => currentPoints ?? cached.points);
      setXAccount((currentXAccount) => currentXAccount ?? cached.xAccount);
      setSubscriber((currentSubscriber) => currentSubscriber || cached.subscriber);
    }, 0);

    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setUid(null);
        setAuthReady(true);
        return;
      }

      setUid(user.uid);
      setAuthReady(true);
    });

    return () => {
      window.clearTimeout(cacheTimer);
      unsub();
    };
  }, []);

  /* --------------------------------------------------
      ② Firestore 読み込み
  -------------------------------------------------- */
  useEffect(() => {
    if (!authReady) return;
    if (!uid) return;

    const load = async () => {
      const today = getTodayJST6();

      const userPromise = withRetry(
        () => getDoc(doc(db, "users", uid)),
        3,
        300,
        30000
      );
      const applySupplemental = async <T,>(
        promise: Promise<T>,
        apply: (value: T) => void,
        label: string,
        onFailure?: () => void
      ) => {
        try {
          apply(await promise);
        } catch (error) {
          console.error(`${label}の読み込みに失敗しました`, error);
          onFailure?.();
        }
      };

      void applySupplemental(
        withRetry(
          () =>
            httpsCallable(functions, "getNibuichiUserStats")({ date: today }),
          2,
          300,
          30000
        ),
        (response) => {
          const data = response.data as {
            todayPrediction?: { prediction?: string } | null;
            todayResult?: { result?: string } | null;
            global?: {
              win?: number;
              draw?: number;
              lose?: number;
              bakuado?: number;
            } | null;
          };
          setTodayPrediction(data.todayPrediction?.prediction ?? null);
          setTodayResult(data.todayResult?.result ?? null);
          const s = data.global ?? {};
          const win = s.win ?? 0;
          const draw = s.draw ?? 0;
          const lose = s.lose ?? 0;
          const bakuado = s.bakuado ?? 0;
          setTotalWin(win);
          setTotalDraw(draw);
          setTotalLose(lose);
          setTotalBakuado(bakuado);
          setTotalBattle(win + draw + lose + bakuado);
          setNibuichiLoaded(true);
        },
        "ニブイチ戦績",
        () => setNibuichiLoaded(true)
      );

      try {
        const userSnap = await userPromise;
        if (userSnap.exists()) {
          const u = userSnap.data();
          const nextNickname = u.displayName?.trim() || "";
          const nextPoints = u.points ?? 0;
          const nextXAccount = u.xAccount ?? undefined;
          const nextSubscriber = u.subscriber === true;
          setNickname(nextNickname);
          setPoints(nextPoints);
          setXAccount(nextXAccount);
          setSubscriber(nextSubscriber);
          sessionStorage.setItem(
            "home-user",
            JSON.stringify({
              uid,
              nickname: nextNickname,
              points: nextPoints,
              xAccount: nextXAccount,
              subscriber: nextSubscriber,
            } satisfies CachedUser)
          );
        } else {
          setNickname("");
        }
      } catch (error) {
        console.error("トップページのユーザー情報読み込みに失敗しました", error);
        if (!getCachedUser()) setNickname("");
      }

    };

    load();
  }, [authReady, uid]);

  /* --------------------------------------------------
     読み込み中
  -------------------------------------------------- */
  if (!authReady) {
    return <LoadingState />;
  }

  if (!uid) {
    return (
      <div style={{ padding: 20, textAlign: "center" }}>
        ログインしてください。
        <br />
        <Link href="/login" style={{ color: "#2563eb" }}>
          ログインはこちら
        </Link>
      </div>
    );
  }

  if (nickname === undefined) {
    return <LoadingState />;
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
  <div style={{ marginBottom: "4px" }}>
    {nibuichiLoaded ? nibuichiStatus : "ニブイチ情報を読み込み中…"}
  </div>
  {/* 1行目：総戦績 */}
  <div>
    【現戦績】{nibuichiLoaded ? `${totalBattle}戦` : "読み込み中…"}
  </div>

  {/* 2行目：内訳 */}
  <div>
    {nibuichiLoaded
      ? `${totalWin}勝 / ${totalDraw}分 / ${totalLose}負 / ${totalBakuado}爆アド`
      : "戦績を取得中…"}
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

      <Link
        href="/guide"
        style={{
          display: "block",
          marginTop: "32px",
          padding: "18px",
          color: "#312e81",
          fontSize: "18px",
          fontWeight: "bold",
          textAlign: "center",
          textDecoration: "none",
          background: "#eef2ff",
          border: "2px solid #818cf8",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        📖 ゆめつきの書斎の使い方を見る
        <span style={{ display: "block", marginTop: "4px", fontSize: "13px" }}>
          アプリの機能や楽しみ方を画像つきで紹介しています
        </span>
      </Link>

      {/* ゆめつき本舗 */}
      <div
        style={{
          marginTop: "40px",
          paddingTop: "20px",
          borderTop: "1px solid #ddd",
        }}
      >
        <a
          href="https://yumetsuki.base.shop"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-block" }}
        >
          <img
            src="/honpo.webp"
            alt="ゆめつき本舗HPはこちら"
            style={{
              width: "100%",
              maxWidth: 320,
              borderRadius: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              cursor: "pointer",
            }}
          />
        </a>
        <p style={{ marginTop: 8, fontWeight: "bold" }}>
          ゆめつき本舗HPはこちら
        </p>
        <p style={{ margin: "4px 0 0", color: "#555", fontSize: "14px" }}>
          トレカ販売、有償企画の参加購入はこちら。
        </p>
      </div>

      {/* 🔴 管理者 */}
      <div
        style={{
          marginTop: "24px",
          paddingTop: "20px",
          borderTop: "1px solid #ddd",
        }}
      >
        <Link
          href="/admin"
          prefetch={false}
          style={adminLinkStyle}
        >
          管理者トップへ
        </Link>
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
    <Link
      href={href}
      prefetch={false}
      style={{
        display: "block",
        width: "100%",
        padding: "12px",
        background: color,
        color: "white",
        borderRadius: "8px",
        fontSize: "18px",
        fontWeight: "bold",
        textAlign: "center",
        border: "none",
        cursor: "pointer",
        boxSizing: "border-box",
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  );
}

const adminLinkStyle = {
  color: "#dc2626",
  fontSize: "18px",
  background: "none",
  border: "none",
  padding: 0,
  textDecoration: "underline",
  cursor: "pointer",
};