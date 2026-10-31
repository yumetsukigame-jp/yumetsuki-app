"use client";

import React, { useEffect, useState } from "react";
export const dynamic = "force-dynamic";

import { db, auth } from "../firebase";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import Link from "next/link";
import Image from "next/image";
import LoadingState from "@/app/components/LoadingState";
import { withRetry } from "@/app/lib/retry";
import { homeGuide, visibleHomeMenu } from "@/app/lib/homeMenu";
import { neraiuchiEnabled } from "@/app/lib/neraiuchi";
import FeatureSection from "@/components/home/FeatureSection";
import MenuImageCard from "@/components/home/MenuImageCard";
import styles from "./home.module.css";

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

const weekdayTopImages = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function getJSTWeekdayImage() {
  const jstNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );
  return weekdayTopImages[jstNow.getDay()];
}

type CachedUser = {
  uid: string;
  nickname: string;
  points: number;
  totalLoginDays?: number;
  xAccount?: string;
  subscriber: boolean;
};

type ArchiveAnnouncement = {
  id: string;
  type: "quiz" | "gacha" | "quiz_new" | "gacha_new" | "gacha_win";
  title: string;
  frame?: string;
  gachaCode?: string;
  isTopFrame?: boolean;
  winnerNickname?: string;
  winnerXAccount?: string;
  archivedAt?: { toDate?: () => Date } | Date | null;
};

const ANNOUNCEMENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function toAnnouncementDate(
  value: ArchiveAnnouncement["archivedAt"]
): Date | null {
  return (
    value instanceof Date
      ? value
      : value && typeof value.toDate === "function"
        ? value.toDate()
        : null
  );
}

function formatAnnouncementDate(
  value: ArchiveAnnouncement["archivedAt"]
): string {
  const date = toAnnouncementDate(value);
  return date
    ? date.toLocaleDateString("ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "numeric",
        day: "numeric",
      })
    : "";
}

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
  const [totalLoginDays, setTotalLoginDays] = useState<number | undefined>(
    undefined
  );
  const [nickname, setNickname] = useState<string | undefined>(undefined);
  const [xAccount, setXAccount] = useState<string | undefined>(undefined);
  const [subscriber, setSubscriber] = useState<boolean>(false);
  const [todayPrediction, setTodayPrediction] = useState<string | null>(null);
  const [todayResult, setTodayResult] = useState<string | null>(null);
  const [archiveAnnouncements, setArchiveAnnouncements] = useState<
    ArchiveAnnouncement[]
  >([]);
  const [showAllArchiveAnnouncements, setShowAllArchiveAnnouncements] =
    useState(false);

  const [totalBattle, setTotalBattle] = useState(0);
  const [totalWin, setTotalWin] = useState(0);
  const [totalDraw, setTotalDraw] = useState(0);
  const [totalLose, setTotalLose] = useState(0);
  const [totalBakuado, setTotalBakuado] = useState(0);
  const [nibuichiLoaded, setNibuichiLoaded] = useState(false);
  const [topImage] = useState(getJSTWeekdayImage);
  const [userLoadError, setUserLoadError] = useState(false);
  const [userRetryKey, setUserRetryKey] = useState(0);
  const [nibuichiError, setNibuichiError] = useState(false);

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
      setTotalLoginDays(
        (currentTotal) => currentTotal ?? cached.totalLoginDays
      );
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

  useEffect(() => {
    if (!uid) return;

    return onSnapshot(
      doc(db, "users", uid),
      (snapshot) => {
        if (snapshot.exists()) {
          setTotalLoginDays(snapshot.data().totalLoginDays ?? 0);
        }
      },
      (error) => {
        console.error("累計ログイン日数の更新監視に失敗しました", error);
      }
    );
  }, [uid]);

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
          setNibuichiError(false);
        },
        "ニブイチ戦績",
        () => {
          setNibuichiLoaded(true);
          setNibuichiError(true);
        }
      );

      void applySupplemental(
        withRetry(
          () => getDoc(doc(db, "homeAnnouncements", "archiveUpdates")),
          2,
          300,
          10000
        ),
        (snapshot) => {
          if (!snapshot.exists()) {
            setArchiveAnnouncements([]);
            return;
          }

          const items = snapshot.data().items;
          if (!Array.isArray(items)) {
            setArchiveAnnouncements([]);
            return;
          }

          setArchiveAnnouncements(
            items
              .filter(
                (item): item is ArchiveAnnouncement =>
                  item !== null &&
                  typeof item === "object" &&
                  typeof item.id === "string" &&
                  (item.type === "quiz" ||
                    item.type === "gacha" ||
                    item.type === "quiz_new" ||
                    item.type === "gacha_new" ||
                    item.type === "gacha_win") &&
                  typeof item.title === "string" &&
                  (item.type !== "gacha_win" ||
                    (typeof item.frame === "string" &&
                      typeof item.gachaCode === "string"))
              )
              .filter((item) => {
                const archivedAt = toAnnouncementDate(item.archivedAt);
                return (
                  archivedAt !== null &&
                  archivedAt.getTime() >=
                    Date.now() - ANNOUNCEMENT_RETENTION_MS
                );
              })
              .sort(
                (a, b) =>
                  (toAnnouncementDate(b.archivedAt)?.getTime() ?? 0) -
                  (toAnnouncementDate(a.archivedAt)?.getTime() ?? 0)
              )
          );
          setShowAllArchiveAnnouncements(false);
        },
        "終了のお知らせ"
      );

      try {
        const userSnap = await userPromise;
        if (userSnap.exists()) {
          setUserLoadError(false);
          const u = userSnap.data();
          const nextNickname = u.displayName?.trim() || "";
          const nextPoints = u.points ?? 0;
          const nextTotalLoginDays = u.totalLoginDays ?? 0;
          const nextXAccount = u.xAccount ?? undefined;
          const nextSubscriber = u.subscriber === true;
          setNickname(nextNickname);
          setPoints(nextPoints);
          setTotalLoginDays(nextTotalLoginDays);
          setXAccount(nextXAccount);
          setSubscriber(nextSubscriber);
          sessionStorage.setItem(
            "home-user",
            JSON.stringify({
              uid,
              nickname: nextNickname,
              points: nextPoints,
              totalLoginDays: nextTotalLoginDays,
              xAccount: nextXAccount,
              subscriber: nextSubscriber,
            } satisfies CachedUser)
          );
        } else {
          setNickname("");
          setUserLoadError(true);
        }
      } catch (error) {
        console.error("トップページのユーザー情報読み込みに失敗しました", error);
        setUserLoadError(true);
        if (!getCachedUser()) setNickname("");
      }

    };

    load();
  }, [authReady, uid, userRetryKey]);

  /* --------------------------------------------------
     読み込み中
  -------------------------------------------------- */
  if (!authReady) {
    return <div className={styles.loading}><LoadingState /></div>;
  }

  if (!uid) {
    return (
      <div className={styles.info} style={{ maxWidth: "480px", margin: "20px auto", textAlign: "center" }}>
        <p>
          ログインしてください。
          <br />
          <Link href="/login" style={{ color: "#2563eb" }}>
            ログインはこちら
          </Link>
        </p>
        <div style={{ marginTop: "28px" }}>
          <GuideLinkCard />
        </div>
      </div>
    );
  }

  if (nickname === undefined) {
    return <div className={styles.loading}><LoadingState /></div>;
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

  const initialAnnouncementIds = new Set([
    ...archiveAnnouncements
      .filter((announcement) => announcement.type !== "gacha_win")
      .slice(0, 2)
      .map((announcement) => announcement.id),
    ...archiveAnnouncements
      .filter(
        (announcement) =>
          announcement.type === "gacha_win" &&
          announcement.isTopFrame === true
      )
      .map((announcement) => announcement.id),
  ]);
  const initialArchiveAnnouncements = archiveAnnouncements.filter(
    (announcement) => initialAnnouncementIds.has(announcement.id)
  );
  const visibleArchiveAnnouncements = showAllArchiveAnnouncements
    ? archiveAnnouncements
    : initialArchiveAnnouncements;
  const hiddenArchiveAnnouncementCount =
    archiveAnnouncements.length - initialArchiveAnnouncements.length;

  return (
    <div
      style={{
        textAlign: "center",
      }}
    >
      <Image
        src={`/topimage/${topImage}.webp`}
        alt="ゆめつきの書斎 トップ画像"
        width={960}
        height={540}
        sizes="(max-width: 960px) 100vw, 960px"
        priority
        style={{
          width: "100%",
          maxWidth: "960px",
          height: "auto",
          margin: "0 auto 20px",
          display: "block",
        }}
      />

      <div className={styles.content}>
      <div className={styles.info}>
      {userLoadError && <div className={styles.error} role="alert">
        最新のユーザー情報を取得できませんでした。表示中の情報は古い可能性があります。
        <button type="button" onClick={() => setUserRetryKey((key) => key + 1)}>再取得</button>
      </div>}
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
  <span style={{ fontWeight: "bold" }}>{points === undefined ? "未取得" : `${points} pt`}</span>
</h1>
<p style={{ margin: "-12px 0 20px", color: "#6b7280", fontSize: "14px" }}>
  累計ログイン日数：{totalLoginDays === undefined ? "未取得" : `${totalLoginDays}日`}
</p>

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
    {nibuichiError ? "ニブイチ情報を取得できませんでした" : nibuichiLoaded ? nibuichiStatus : "ニブイチ情報を読み込み中…"}
  </div>
  {/* 1行目：総戦績 */}
  <div>
    【現戦績】{nibuichiError ? "未取得" : nibuichiLoaded ? `${totalBattle}戦` : "読み込み中…"}
  </div>

  {/* 2行目：内訳 */}
  <div>
    {nibuichiError ? "再取得をお試しください" : nibuichiLoaded
      ? `${totalWin}勝 / ${totalDraw}分 / ${totalLose}負 / ${totalBakuado}爆アド`
      : "戦績を取得中…"}
  </div>
  {nibuichiError && <button type="button" onClick={() => setUserRetryKey((key) => key + 1)}
    style={{ minHeight: 44, padding: "8px 12px", textDecoration: "underline" }}>戦績を再取得</button>}
</div>

{archiveAnnouncements.length > 0 && (
  <div
    style={{
      marginBottom: "20px",
      padding: "12px 14px",
      background: "#f8fafc",
      border: "1px solid #e2e8f0",
      borderRadius: "8px",
      textAlign: "left",
    }}
  >
    <div
      style={{
        marginBottom: "6px",
        color: "#334155",
        fontSize: "14px",
        fontWeight: "bold",
      }}
    >
      お知らせ
    </div>
    <div style={{ display: "grid", gap: "6px" }}>
      {visibleArchiveAnnouncements.map((announcement) => {
        const isGachaWin = announcement.type === "gacha_win";
        const isQuiz =
          announcement.type === "quiz" || announcement.type === "quiz_new";
        const isNew =
          announcement.type === "quiz_new" ||
          announcement.type === "gacha_new";
        const archivedDate = formatAnnouncementDate(
          announcement.archivedAt
        );
        const winnerXAccount = announcement.winnerXAccount?.trim();
        const formattedWinnerXAccount = winnerXAccount
          ? winnerXAccount.startsWith("@")
            ? winnerXAccount
            : `@${winnerXAccount}`
          : "";

        return (
          <Link
            key={announcement.id}
            href={
              isGachaWin
                ? `/gacha/results?code=${announcement.gachaCode}`
                : isNew
                  ? isQuiz
                    ? "/quizzes"
                    : "/gacha/list"
                : isQuiz
                  ? "/quizzes/archive"
                  : "/gacha/archive"
            }
            style={{
              color: "#475569",
              fontSize: "14px",
              lineHeight: 1.5,
              textDecoration: "none",
            }}
          >
            {isGachaWin ? (
              <>
                🎉 {announcement.winnerNickname || "ユーザー"}
                {formattedWinnerXAccount &&
                  `（${formattedWinnerXAccount}）`}
                さんがガチャ「{announcement.title}」で「
                {announcement.frame}」に当選しました。
              </>
            ) : (
              <>
                {isQuiz ? "🧠" : "🎰"} {isQuiz ? "クイズ" : "ガチャ"}「
                {announcement.title}」が
                {isNew ? "追加されました。" : "終了しました。"}
              </>
            )}
            {archivedDate && (
              <span style={{ marginLeft: "6px", color: "#94a3b8" }}>
                {archivedDate}
              </span>
            )}
          </Link>
        );
      })}
    </div>
    {hiddenArchiveAnnouncementCount > 0 && (
      <button
        type="button"
        onClick={() =>
          setShowAllArchiveAnnouncements((current) => !current)
        }
        style={{
          display: "block",
          margin: "10px auto 0",
          padding: "5px 10px",
          color: "#475569",
          background: "white",
          border: "1px solid #cbd5e1",
          borderRadius: "6px",
          cursor: "pointer",
          fontSize: "13px",
        }}
      >
        {showAllArchiveAnnouncements
          ? "詳細を閉じる"
          : `詳細を表示（残り${hiddenArchiveAnnouncementCount}件）`}
      </button>
    )}
  </div>
)}
</div>

{visibleHomeMenu(neraiuchiEnabled)
  .map((section) => <FeatureSection key={section.id} section={section} />)}

      <div className={styles.standalone}>
        <GuideLinkCard />
      </div>

      {/* ゆめつき本舗 */}
      <div
        className={styles.standalone}
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
        className={styles.standalone}
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
    </div>
  );
}

/* ------------------------------
   セクションコンポーネント
------------------------------ */
function GuideLinkCard() {
  return <MenuImageCard item={homeGuide} />;
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