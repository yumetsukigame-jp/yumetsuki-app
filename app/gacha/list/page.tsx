"use client";

import { useEffect, useState } from "react";
import { functions, db, auth } from "@/firebase";
import { httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";

/* --------------------------------------------------
   Timestamp を安全に Date に変換する関数
-------------------------------------------------- */
function toDateSafe(ts: any) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts._seconds) return new Date(ts._seconds * 1000);
  return null;
}

export default function PublicGachaListPage() {
  const [gachas, setGachas] = useState<any[]>([]);
  const [allResults, setAllResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"new" | "popular">("new");
  const [open, setOpen] = useState<{ [key: string]: boolean }>({});
  const router = useRouter();

  useEffect(() => {
    load();
  }, [sort]);

  const load = async () => {
    setLoading(true);

    /* --------------------------------------------------
       ★ ① 公開ガチャ一覧を取得
    -------------------------------------------------- */
    const fnList = httpsCallable(functions, "getPublicGachaList");
    const resList: any = await fnList();
    const list = resList.data || [];

    /* --------------------------------------------------
       ★ ② 全ガチャの結果履歴を取得（重要）
    -------------------------------------------------- */
    const fnResults = httpsCallable(functions, "getGachaResults");
    const resResults: any = await fnResults();
    const results = resResults.data || [];
    setAllResults(results);

    const now = new Date();

    /* --------------------------------------------------
       ★ 公開・限定すべて一覧に表示する
    -------------------------------------------------- */
    let filtered = list.filter((g: any) => {
      if (!g.title || g.title.trim() === "") return false;

      const exp = toDateSafe(g.expiresAt);
      if (exp && exp < now) return false;

      return true; // ← 公開・限定すべて表示
    });

    filtered = filtered.filter((g) => g.createdAt);

    /* --------------------------------------------------
       ★ ③ ソート（履歴件数ベース）
    -------------------------------------------------- */
    let sorted = [...filtered];

    if (sort === "new") {
      sorted.sort(
        (a, b) =>
          toDateSafe(b.createdAt).getTime() -
          toDateSafe(a.createdAt).getTime()
      );
    } else if (sort === "popular") {
      sorted.sort((a, b) => {
        const aUsed = results.filter((r: any) => r.code === a.code).length;
        const bUsed = results.filter((r: any) => r.code === b.code).length;
        return bUsed - aUsed;
      });
    }

    setGachas(sorted);
    setLoading(false);
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

      {loading && <p>読み込み中…</p>}
      {!loading && gachas.length === 0 && <p>表示できるガチャがありません。</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {gachas.map((g) => {
          /* --------------------------------------------------
             ★ ④ このガチャの履歴件数を取得
          -------------------------------------------------- */
          const resultsForThis = allResults.filter(
            (r: any) => r.code === g.code
          );

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

          const isOpen = open[g.code] ?? false;

          return (
            <div
              key={g.code}
              style={{
                padding: 16,
                borderRadius: 12,
                background: "white",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              }}
            >
              {/* サムネ */}
              {g.thumbnail && (
                <div style={{ textAlign: "center", marginBottom: 12 }}>
                  <img
                    src={`/gacha/${g.thumbnail}`}
                    style={{
                      width: "100%",
                      maxWidth: 240,
                      borderRadius: 12,
                      boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                    }}
                  />
                </div>
              )}

              {/* タイトル（限定ガチャは履歴がないと遷移不可） */}
              <h2
                style={{ margin: 0, color: "#2563eb", cursor: "pointer" }}
                onClick={async () => {
                  const flags = g.publicFlags ?? [];
                  const isLimited = flags.includes("limited");

                  if (isLimited) {
                    const uid = auth.currentUser?.uid;
                    if (!uid) {
                      alert("このガチャは限定公開です（コード入力が必要です）");
                      return;
                    }

                    const historyRef = doc(
                      db,
                      "userGachaHistory",
                      `${uid}_${g.code}`
                    );
                    const snap = await getDoc(historyRef);

                    if (!snap.exists()) {
                      alert("このガチャは限定公開です（コード入力が必要です）");
                      return;
                    }
                  }

                  router.push(`/gacha/${g.code}`);
                }}
              >
                {g.title}
              </h2>

              {/* 公開設定 */}
              <p style={{ margin: "6px 0" }}>{renderFlags(g.publicFlags)}</p>

              {/* 抽選方式 */}
              <p style={{ margin: "6px 0" }}>
                抽選方式：
                {g.mode === "count" ? "枠数方式" : "確率方式"}
              </p>

              {/* リセット方式 */}
              <p style={{ margin: "6px 0" }}>
                リセット：
                {g.resetType === "daily"
                  ? "デイリー（毎日6時）"
                  : "なし"}
              </p>

              <p style={{ margin: "6px 0" }}>
                1回 {g.point.cost} pt（上限 {g.point.maxPerUser} 回）
              </p>

              {/* ▼ 詳細 */}
              <button
                onClick={() =>
                  setOpen((prev) => ({ ...prev, [g.code]: !isOpen }))
                }
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

              {isOpen && (
                <div style={{ marginTop: 16 }}>
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

                  <p style={{ margin: "6px 0", fontSize: 14, color: "#555" }}>
                    締切：
                    {toDateSafe(g.expiresAt)
                      ? toDateSafe(g.expiresAt).toLocaleString()
                      : "なし"}
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
