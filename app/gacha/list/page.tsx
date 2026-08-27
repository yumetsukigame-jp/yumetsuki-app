"use client";

import { useEffect, useState } from "react";
import { functions, db, auth } from "@/firebase";
import { httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import { getCountFromServer } from "firebase/firestore";
import LoadingState from "@/app/components/LoadingState";
import { withRetry } from "@/app/lib/retry";

type FirestoreDateLike =
  | { toDate?: () => Date; _seconds?: number; seconds?: number }
  | Date
  | null
  | undefined;

type GachaFrame = {
  label?: string;
  name?: string;
  maxCount?: number;
  [key: string]: unknown;
};

type GachaRecord = {
  code: string;
  title?: string;
  createdAt?: FirestoreDateLike;
  expiresAt?: FirestoreDateLike;
  publicFlags?: string[];
  frames?: GachaFrame[];
  point?: { cost?: number; maxPerUser?: number };
  totalCount?: number;
  mode?: "count" | "probability";
  resetType?: string;
  thumbnail?: string;
  xAccountList?: string[];
  [key: string]: unknown;
};

type GachaResultRecord = {
  id: string;
  uid: string;
  frame?: string;
  createdAt?: FirestoreDateLike;
  [key: string]: unknown;
};

/* --------------------------------------------------
   Timestamp を安全に Date に変換
-------------------------------------------------- */
function toDateSafe(ts: FirestoreDateLike): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === "object" && "toDate" in ts && typeof ts.toDate === "function") return ts.toDate();
  if (typeof ts === "object" && "_seconds" in ts && typeof ts._seconds === "number") return new Date(ts._seconds * 1000);
  return null;
}

/* --------------------------------------------------
   ★ ユーザー情報キャッシュ付き取得（＠重複修正済み）
-------------------------------------------------- */
const userCache: Record<string, { name: string; xAccount: string }> = {};

function normalizeXAccount(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s\r\n\t]+/g, "")
    .replace(/[@＠]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

async function getUserInfo(uid: string) {
  if (userCache[uid]) return userCache[uid];

  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) {
    userCache[uid] = { name: "名無し", xAccount: "" };
    return userCache[uid];
  }

  const u = snap.data();
  const name = u.displayName || "名無し";

  // ★ xAccount の先頭の @ を除去して正規化
  const rawX = u.xAccount || "";
  const normalizedX = rawX.replace(/^@+/, ""); // 先頭の @ を全部削除
  const x = normalizedX ? `（@${normalizedX}）` : "";

  userCache[uid] = {
    name: `${name}${x}`,
    xAccount: normalizeXAccount(rawX),
  };
  return userCache[uid];
}

export default function PublicGachaListPage() {
  const [gachas, setGachas] = useState<GachaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"new" | "popular">("new");

  const [resultsMap, setResultsMap] = useState<Record<string, GachaResultRecord[]>>({});
  const [resultErrors, setResultErrors] = useState<Record<string, string>>({});
  const [countCache, setCountCache] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [openXAccounts, setOpenXAccounts] = useState<Record<string, boolean>>({});
  const [drawnXAccounts, setDrawnXAccounts] = useState<Record<string, string[]>>({});
  const [drawnXAccountErrors, setDrawnXAccountErrors] = useState<Record<string, string>>({});
  const [loadingDrawnXAccounts, setLoadingDrawnXAccounts] = useState<Record<string, boolean>>({});
  const router = useRouter();

  useEffect(() => {
    load();
  }, [sort]);

  /* --------------------------------------------------
     ★ 公開ガチャ一覧を取得
  -------------------------------------------------- */
  const load = async () => {
    setLoading(true);
    try {
      const fnList = httpsCallable(functions, "getPublicGachaList");
      const resList = (await withRetry(() => fnList())) as { data?: GachaRecord[] };
      const list = resList.data ?? [];

    const now = new Date();

    let filtered = list.filter((g: GachaRecord) => {
      if (!g.title?.trim()) return false;
      const exp = toDateSafe(g.expiresAt);
      if (exp && exp < now) return false;
      return true;
    });

    filtered = filtered.filter((g) => g.createdAt);

    let sorted = [...filtered];

    if (sort === "new") {
      sorted.sort((a, b) => {
        const bDate = toDateSafe(b.createdAt)?.getTime() ?? 0;
        const aDate = toDateSafe(a.createdAt)?.getTime() ?? 0;
        return bDate - aDate;
      });
    }

    if (sort === "popular") {
      const newCache = { ...countCache };

      for (const g of sorted) {
        if (newCache[g.code] == null) {
          const countSnap = await getCountFromServer(
            collection(db, "gachaResults", g.code, "results")
          );
          newCache[g.code] = Number(countSnap.data().count ?? 0);
        }
      }

      setCountCache(newCache);

      sorted.sort((a, b) => {
        const aUsed = newCache[a.code] ?? 0;
        const bUsed = newCache[b.code] ?? 0;
        return bUsed - aUsed;
      });
    }

      setGachas(sorted);
    } catch (error) {
      console.error("ガチャ一覧の読み込みに失敗しました", error);
      setGachas([]);
    } finally {
      setLoading(false);
    }
  };

  /* --------------------------------------------------
     ★ 個別ガチャの結果を遅延読み込み
  -------------------------------------------------- */
  const loadResultsForCode = async (code: string) => {
    if (resultsMap[code]) return;

    try {
      const snap = await getDocs(
        query(
          collection(db, "gachaResults", code, "results"),
          orderBy("createdAt", "desc")
        )
      );

      const list = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Record<string, unknown>),
        } as GachaResultRecord))
        .filter((d) => !!d.createdAt);

      setResultsMap((prev) => ({
        ...prev,
        [code]: list,
      }));
    } catch (error) {
      console.error("ガチャ結果の読み込みに失敗しました", error);
      setResultErrors((previous) => ({
        ...previous,
        [code]: "詳細を読み込めませんでした。",
      }));
    }
  };

  const loadDrawnXAccounts = async (code: string) => {
    if (drawnXAccounts[code] || loadingDrawnXAccounts[code]) return;

    setLoadingDrawnXAccounts((previous) => ({ ...previous, [code]: true }));
    try {
      const results = await getDocs(collection(db, "gachaResults", code, "results"));
      const accounts = await Promise.all(
        Array.from(new Set(results.docs.map((result) => result.get("uid"))))
          .filter((uid): uid is string => typeof uid === "string")
          .map(async (uid) => (await getUserInfo(uid)).xAccount)
      );

      setDrawnXAccounts((previous) => ({
        ...previous,
        [code]: accounts.filter(Boolean),
      }));
    } catch (error) {
      console.error("抽選済みXアカウントの読み込みに失敗しました", error);
      setDrawnXAccountErrors((previous) => ({
        ...previous,
        [code]: "抽選履歴を読み込めませんでした。",
      }));
    } finally {
      setLoadingDrawnXAccounts((previous) => ({ ...previous, [code]: false }));
    }
  };

  /* --------------------------------------------------
     publicFlags 表示
  -------------------------------------------------- */
  const renderFlags = (flags: string[] = []) => {
    const map: Record<string, string> = {
      public: "🌐 公開",
      limited: "🔒 限定",
      subscriber: "⭐ サブスク限定",
      nibuichi_winner: "🎯 的中者限定",
      x_account_match: "📝 Xアカウント一致",
    };
    if (!Array.isArray(flags)) return "（未設定）";
    return flags.map((f) => map[f] ?? f).join(" / ");
  };

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 20 }}>🌟 ガチャ一覧</h1>

      {/* ソート */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => setSort("new")}
          style={{
            flex: 1,
            padding: 10,
            background: sort === "new" ? "#2563eb" : "#6b7280",
            color: "white",
            borderRadius: 8,
            border: "none",
          }}
        >
          新着順
        </button>

        <button
          onClick={() => setSort("popular")}
          style={{
            flex: 1,
            padding: 10,
            background: sort === "popular" ? "#2563eb" : "#6b7280",
            color: "white",
            borderRadius: 8,
            border: "none",
          }}
        >
          人気順
        </button>
      </div>

      {loading && <LoadingState />}
      {!loading && gachas.length === 0 && <p>表示できるガチャがありません。</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {gachas.map((g) => {
          const isOpen = open[g.code] ?? false;
          const isXAccountsOpen = openXAccounts[g.code] ?? false;
          const resultsForThis = resultsMap[g.code] ?? [];
          const drawnAccountsForThis = new Set(drawnXAccounts[g.code] ?? []);
          const targetXAccounts = Array.from(
            new Set(
              (g.xAccountList ?? []).flatMap((account) =>
                Array.from(account.matchAll(/@([A-Za-z0-9_]{1,15})/g)).map(
                  ([, handle]) => `@${handle}`
                )
              )
            )
          );
          const isXAccountMatch = g.publicFlags?.includes("x_account_match") ?? false;

          /* --------------------------------------------------
             ★ グレーアウト判定
          -------------------------------------------------- */
          const frames: GachaFrame[] = g.frames ?? [];
          const lastIndex = frames.length - 1;
          const upperFrames = frames.slice(0, lastIndex);

          const isGrayOut =
            upperFrames.length > 0 &&
            upperFrames.every((f: GachaFrame) => {
              const used = resultsForThis.filter(
                (r: GachaResultRecord) => r.frame === (f.label ?? f.name)
              ).length;
              const max = f.maxCount ?? 0;
              return max - used <= 0;
            });

          const totalUsed = resultsForThis.length;
          const totalMax = g.totalCount ?? 0;

          const percent =
            g.mode === "count" && totalMax > 0
              ? Math.round((totalUsed / totalMax) * 100)
              : 0;

          const remaining =
            g.mode === "count"
              ? totalMax - totalUsed
              : "∞";

          return (
            <div
              key={g.code}
              style={{
                padding: 16,
                borderRadius: 12,
                background: isGrayOut ? "#e5e7eb" : "white",
                opacity: isGrayOut ? 0.6 : 1,
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              }}
            >
              {/* サムネ */}
              {g.thumbnail && (
                <div style={{ textAlign: "center", marginBottom: 12 }}>
                  <img
                    src={g.thumbnail}
                    style={{
                      width: "100%",
                      maxWidth: 240,
                      borderRadius: 12,
                      boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                    }}
                  />
                </div>
              )}

              {/* タイトル */}
              <h2
                style={{ margin: 0, color: "#2563eb", cursor: "pointer" }}
                onClick={() => router.push(`/gacha/${g.code}`)}
              >
                {g.title}
              </h2>

              <p style={{ margin: "6px 0" }}>{renderFlags(g.publicFlags)}</p>

              {isXAccountMatch && (
                <div style={{ margin: "10px 0" }}>
                  <button
                    type="button"
                    aria-expanded={isXAccountsOpen}
                    onClick={() => {
                      setOpenXAccounts((previous) => ({
                        ...previous,
                        [g.code]: !isXAccountsOpen,
                      }));
                      if (!isXAccountsOpen) {
                        void loadDrawnXAccounts(g.code);
                      }
                    }}
                    style={{
                      padding: "8px 12px",
                      background: "#e0e7ff",
                      color: "#3730a3",
                      borderRadius: 8,
                      border: "1px solid #818cf8",
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
                  >
                    {isXAccountsOpen
                      ? "▲ 対象のXアカウントを閉じる"
                      : "▼ 対象のXアカウントを確認する"}
                  </button>

                  {isXAccountsOpen && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: 12,
                        background: "#f8fafc",
                        borderRadius: 8,
                        textAlign: "left",
                      }}
                    >
                      {targetXAccounts.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                          {targetXAccounts.map((account) => {
                            const hasDrawn = drawnAccountsForThis.has(
                              normalizeXAccount(account)
                            );

                            return (
                              <li
                                key={account}
                                style={{
                                  color: hasDrawn ? "#b45309" : "#111827",
                                  fontWeight: hasDrawn ? "bold" : "normal",
                                }}
                              >
                                {account}
                                {hasDrawn && "（抽選済み）"}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p style={{ margin: 0 }}>
                          対象のXアカウントはまだ登録されていません。
                        </p>
                      )}
                      {loadingDrawnXAccounts[g.code] && (
                        <p style={{ margin: "8px 0 0", color: "#6b7280" }}>
                          抽選済みアカウントを確認中…
                        </p>
                      )}
                      {drawnXAccountErrors[g.code] && (
                        <p style={{ margin: "8px 0 0", color: "#dc2626" }}>
                          {drawnXAccountErrors[g.code]}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <p style={{ margin: "6px 0" }}>
                抽選方式：
                {g.mode === "count" ? "枠数方式" : "確率方式"}
              </p>

              <p style={{ margin: "6px 0" }}>
                リセット：
                {g.resetType === "daily"
                  ? "デイリー（毎日6時）"
                  : "なし"}
              </p>

              <p style={{ margin: "6px 0" }}>
                1回 {g.point?.cost ?? 0} pt（上限 {g.point?.maxPerUser ?? 0} 回）
              </p>

              {/* ▼ 詳細 */}
              <button
                onClick={async () => {
                  setOpen((prev) => ({ ...prev, [g.code]: !isOpen }));

                  if (!isOpen) {
                    await loadResultsForCode(g.code);
                  }
                }}
                style={{
                  width: "100%",
                  padding: "10px",
                  marginTop: 10,
                  background: "#4f46e5",
                  color: "white",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {isOpen ? "▲ 詳細を閉じる" : "▼ 詳細を見る"}
              </button>

              {isOpen && resultErrors[g.code] && (
                <p style={{ marginTop: 12, color: "#dc2626" }}>
                  {resultErrors[g.code]}
                </p>
              )}

              {isOpen && !resultsMap[g.code] && !resultErrors[g.code] && (
                <p style={{ marginTop: 12 }}>読み込み中…</p>
              )}

              {isOpen && resultsMap[g.code] && (
                <div style={{ marginTop: 16 }}>
                  {/* 使用状況 */}
                  {g.mode === "count" && (
                    <div style={{ margin: "10px 0" }}>
                      <div
                        style={{
                          height: 10,
                          background: "#e5e7eb",
                          borderRadius: 6,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${percent}%`,
                            height: "100%",
                            background: percent > 80 ? "#ef4444" : "#2563eb",
                          }}
                        ></div>
                      </div>
                      <p style={{ margin: "4px 0", fontSize: 14 }}>
                        使用済み：{totalUsed} / {totalMax}（{percent}%）
                      </p>
                    </div>
                  )}

                  <p style={{ margin: "6px 0" }}>残数：{remaining}</p>

                  {/* 枠ごとの状況 */}
                  <div style={{ marginTop: 20 }}>
                    <h3 style={{ marginBottom: 10 }}>🎁 枠ごとの状況</h3>

                    {(g.frames ?? []).map((f: GachaFrame) => {
                      const frameName = f.label ?? f.name ?? "-";
                      const frameResults = resultsForThis.filter(
                        (r: GachaResultRecord) => r.frame === frameName
                      );

                      const frameRemaining =
                        g.mode === "count"
                          ? (f.maxCount ?? 0) - frameResults.length
                          : "∞";

                      const grouped: Record<string, number> = {};
                      frameResults.forEach((r: any) => {
                        grouped[r.uid] = (grouped[r.uid] || 0) + 1;
                      });

                      return (
                        <div
                          key={frameName}
                          style={{
                            marginBottom: 16,
                            padding: 10,
                            background: "#f9fafb",
                            borderRadius: 8,
                          }}
                        >
                          <p style={{ margin: 0, fontWeight: "bold" }}>
                            {frameName}（残り：{String(frameRemaining)}）
                          </p>

                          {Object.keys(grouped).length === 0 ? (
                            <p style={{ marginLeft: 12, marginTop: 4 }}>
                              当選者なし
                            </p>
                          ) : (
                            <ul style={{ marginLeft: 20, marginTop: 4 }}>
                              {Object.entries(grouped).map(
                                ([uid, count]) => (
                                  <FrameWinnerItem
                                    key={uid}
                                    uid={uid}
                                    count={count as number}
                                  />
                                )
                              )}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <p style={{ margin: "6px 0", fontSize: 14, color: "#555" }}>
                    締切：
                    {(() => {
                      const expiresDate = toDateSafe(g.expiresAt);
                      return expiresDate ? expiresDate.toLocaleString() : "なし";
                    })()}
                  </p>

                  <button
                    onClick={() => router.push(`/gacha/${g.code}`)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      marginTop: 10,
                      background: "#2563eb",
                      color: "white",
                      borderRadius: 8,
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    このガチャのページへ
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------------------------
   ★ 当選者表示コンポーネント（＠重複修正済み）
-------------------------------------------------- */
function FrameWinnerItem({
  uid,
  count,
}: {
  uid: string;
  count: number;
}) {
  const [name, setName] = useState("読み込み中…");

  useEffect(() => {
    (async () => {
      const info = await getUserInfo(uid);
      setName(info.name);
    })();
  }, []);

  return <li>{name} {count > 1 ? `×${count}回` : ""}</li>;
}
