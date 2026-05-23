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

/* --------------------------------------------------
   ★ ユーザー情報キャッシュ付き取得
-------------------------------------------------- */
const userCache: Record<string, any> = {};

async function getUserInfo(uid: string) {
  if (userCache[uid]) return userCache[uid];

  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) {
    userCache[uid] = { name: "名無し" };
    return userCache[uid];
  }

  const u = snap.data();
  const name = u.displayName || "名無し";
  const x = u.xAccount ? `（${u.xAccount}）` : "";

  userCache[uid] = { name: `${name}${x}` };
  return userCache[uid];
}

export default function PublicGachaListPage() {
  const [gachas, setGachas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"new" | "popular">("new");

  // ★ 遅延読み込み用：各ガチャの結果を個別に保持
  const [resultsMap, setResultsMap] = useState<Record<string, any[]>>({});

  // ★ 人気順用：全件取得キャッシュ
  const [allResultsCache, setAllResultsCache] = useState<any[] | null>(null);

  const [open, setOpen] = useState<{ [key: string]: boolean }>({});
  const router = useRouter();

  useEffect(() => {
    load();
  }, [sort]);

  const load = async () => {
    setLoading(true);

    /* --------------------------------------------------
       ★ ① 公開ガチャ一覧を取得（軽い）
    -------------------------------------------------- */
    const fnList = httpsCallable(functions, "getPublicGachaList");
    const resList: any = await fnList();
    const list = resList.data || [];

    const now = new Date();

    /* --------------------------------------------------
       ★ 公開・限定すべて一覧に表示する
    -------------------------------------------------- */
    let filtered = list.filter((g: any) => {
      if (!g.title || g.title.trim() === "") return false;

      const exp = toDateSafe(g.expiresAt);
      if (exp && exp < now) return false;

      return true;
    });

    filtered = filtered.filter((g) => g.createdAt);

    /* --------------------------------------------------
       ★ ② ソート
    -------------------------------------------------- */
    let sorted = [...filtered];

    if (sort === "new") {
      sorted.sort(
        (a, b) =>
          toDateSafe(b.createdAt).getTime() -
          toDateSafe(a.createdAt).getTime()
      );
    }

    if (sort === "popular") {
      // ★ 初回だけ全件取得
      let all = allResultsCache;
      if (!all) {
        const fn = httpsCallable(functions, "getGachaResults");
        const res: any = await fn();
        all = res.data || [];
        setAllResultsCache(all);
      }

      sorted.sort((a, b) => {
        const aUsed = all.filter((r: any) => r.code === a.code).length;
        const bUsed = all.filter((r: any) => r.code === b.code).length;
        return bUsed - aUsed;
      });
    }

    setGachas(sorted);
    setLoading(false);
  };

  /* --------------------------------------------------
     ★ 個別ガチャの結果を遅延読み込み
  -------------------------------------------------- */
  const loadResultsForCode = async (code: string) => {
    if (resultsMap[code]) return; // 既に取得済みならスキップ

    const fn = httpsCallable(functions, "getGachaResults");
    const res: any = await fn();

    const filtered = res.data.filter((r: any) => r.code === code);

    setResultsMap((prev) => ({
      ...prev,
      [code]: filtered,
    }));
  };

  /* --------------------------------------------------
     publicFlags 表示（Xアカウント一致追加）
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

      {loading && <p>読み込み中…</p>}
      {!loading && gachas.length === 0 && <p>表示できるガチャがありません。</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {gachas.map((g) => {
          const isOpen = open[g.code] ?? false;

          /* --------------------------------------------------
             ★ 遅延読み込みされた結果
          -------------------------------------------------- */
          const resultsForThis = resultsMap[g.code] ?? [];

          /* --------------------------------------------------
             ★ グレーアウト判定（最新 resultsMap ベース）
          -------------------------------------------------- */
          const frames = g.frames || [];
          const lastIndex = frames.length - 1;
          const upperFrames = frames.slice(0, lastIndex);

          const isGrayOut =
            upperFrames.length > 0 &&
            upperFrames.every((f) => {
              const used = resultsForThis.filter(
                (r: any) => r.frameName === f.label
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

              {/* タイトル */}
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
                onClick={async () => {
                  setOpen((prev) => ({ ...prev, [g.code]: !isOpen }));

                  // ★ 初めて開くときだけ結果を読み込む
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

              {/* ★ ロード中表示 */}
              {isOpen && !resultsMap[g.code] && (
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

                  {/* ★ 各枠の残数 + 当選者一覧 */}
                  <div style={{ marginTop: 20 }}>
                    <h3 style={{ marginBottom: 10 }}>🎁 枠ごとの状況</h3>

                    {g.frames.map((f: any) => {
                      const frameName = f.label;
                      const frameResults = resultsForThis.filter(
                        (r: any) => r.frameName === frameName
                      );

                      const frameRemaining =
                        g.mode === "count"
                          ? f.maxCount - frameResults.length
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
                            {frameName}（残り：{frameRemaining}）
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

/* --------------------------------------------------
   ★ 当選者表示コンポーネント（×●回対応）
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
