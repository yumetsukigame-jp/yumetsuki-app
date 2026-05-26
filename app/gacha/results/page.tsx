"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { db, auth } from "@/firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { useSearchParams, useRouter } from "next/navigation";

/* --------------------------------------------------
   ユーザー名の整形（displayName + xAccount）@正規化対応
-------------------------------------------------- */
function formatUserName(u: any) {
  const name = u.displayName || "";
  const rawX = u.xAccount || "";

  // ★ 先頭の @ を全部削除して正規化
  const normalizedX = rawX.replace(/^@+/, "");

  if (name && normalizedX) return `${name}（@${normalizedX}）`;
  if (name) return name;
  if (normalizedX) return `@${normalizedX}`;
  return "名無し";
}

/* --------------------------------------------------
   内側コンポーネント
-------------------------------------------------- */
function ResultsContent() {
  const [grouped, setGrouped] = useState<any>({});
  const [open, setOpen] = useState<{ [key: string]: boolean }>({});
  const [titles, setTitles] = useState<{ [key: string]: string }>({});
  const [meta, setMeta] = useState<{ [key: string]: any }>({});

  const [filterMine, setFilterMine] = useState(false);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"new" | "old">("new");

  const [loading, setLoading] = useState(true);

  const searchParams = useSearchParams();
  const router = useRouter();

  const filterCode = searchParams.get("code") ?? null;
  const currentUid = auth.currentUser?.uid ?? null;

  // ★ ユーザー名キャッシュ
  const userCache = useRef<{ [uid: string]: string }>({});

  /* --------------------------------------------------
     Firestore からユーザー名取得（キャッシュ付き）
  -------------------------------------------------- */
  const getUserName = async (uid: string) => {
    if (userCache.current[uid]) return userCache.current[uid];

    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) {
      userCache.current[uid] = "名無し";
      return "名無し";
    }

    const u = snap.data();
    const name = formatUserName(u);
    userCache.current[uid] = name;
    return name;
  };

  /* --------------------------------------------------
     結果ロード（サブコレクション版）
  -------------------------------------------------- */
  const loadResults = async () => {
    setLoading(true);

    // ① gachaCodes を全部取得
    const gachaSnap = await getDocs(collection(db, "gachaCodes"));
    const gachaList = gachaSnap.docs.map((d) => ({
      code: d.id,
      ...d.data(),
    }));

    const groupedData: any = {};
    const titleMap: any = {};
    const metaMap: any = {};

    // ② 各ガチャごとに results を取得
    for (const g of gachaList) {
      const code = g.code as string;

      if (filterCode && code !== filterCode) continue;

      const resultsSnap = await getDocs(
        query(
          collection(db, "gachaResults", code, "results"),
          orderBy("createdAt", "desc")
        )
      );

      if (resultsSnap.empty) continue;

      const results = await Promise.all(
        resultsSnap.docs
          .map((d) => ({
            id: d.id,
            ...d.data(),
          }))
          .filter((d) => d.createdAt)
          .map(async (d) => {
            const name = await getUserName(d.uid);
            return {
              ...d,
              userName: name,
              _userName: name.toLowerCase(),
            };
          })
      );

      groupedData[code] = results;

      titleMap[code] = g.title;
      metaMap[code] = {
        publicFlags: g.publicFlags ?? [],
        frames: g.frames ?? [],
        mode: g.mode,
        thumbnail: g.thumbnail ?? "",
        xAccountList: g.xAccountList ?? [],
      };
    }

    setGrouped(groupedData);
    setTitles(titleMap);
    setMeta(metaMap);
    setLoading(false);
  };

  useEffect(() => {
    loadResults();
  }, []);

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
    if (flags.length === 0) return "（未設定）";
    return flags.map((f) => map[f] ?? f).join(" / ");
  };

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}>
      <h1 style={{ textAlign: "center", marginBottom: 20 }}>📜 ガチャ結果一覧</h1>

      {/* ★ filterCode がある時だけ表示 */}
      {filterCode && (
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => router.push(`/gacha/results`)}
            style={{
              padding: "10px 16px",
              background: "#6b7280",
              color: "white",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              width: "100%",
              marginBottom: 10,
            }}
          >
            他のガチャの結果一覧へ
          </button>

          <button
            onClick={() => router.push(`/gacha/${filterCode}`)}
            style={{
              padding: "10px 16px",
              background: "#2563eb",
              color: "white",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              width: "100%",
            }}
          >
            このガチャのページへ戻る
          </button>
        </div>
      )}

      {/* 🔍 検索・フィルタ・並び替え */}
      <div
        style={{
          background: "white",
          padding: 16,
          borderRadius: 12,
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          marginBottom: 20,
        }}
      >
        <input
          type="text"
          placeholder="ユーザー名 / 枠名で検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: 10,
            border: "1px solid #ccc",
            borderRadius: 6,
            marginBottom: 12,
          }}
        />

        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => setFilterMine((v) => !v)}
            style={{
              flex: 1,
              padding: "10px 0",
              background: filterMine ? "#2563eb" : "#6b7280",
              color: "white",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
            }}
          >
            {filterMine ? "全員の結果を表示" : "自分の結果だけ表示"}
          </button>

          <button
            onClick={() =>
              setSortOrder((v) => (v === "new" ? "old" : "new"))
            }
            style={{
              flex: 1,
              padding: "10px 0",
              background: "#4f46e5",
              color: "white",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
            }}
          >
            並び替え：{sortOrder === "new" ? "新着順" : "古い順"}
          </button>
        </div>
      </div>

      {/* ★ 読み込み中 */}
      {loading ? (
        <p>結果読み込み中…</p>
      ) : Object.keys(grouped).length === 0 ? (
        <p>結果がありません。</p>
      ) : null}

      {/* ★ 結果一覧 */}
      {!loading &&
        Object.entries(grouped).map(([code, items]: any) => {
          const title = titles[code];
          const info = meta[code];
          const flags = info.publicFlags ?? [];

          return (
            <div
              key={code}
              style={{
                background: "white",
                padding: 16,
                borderRadius: 12,
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                marginBottom: 20,
              }}
            >
              {/* アコーディオンヘッダー */}
              <div
                onClick={() =>
                  setOpen((prev) => ({ ...prev, [code]: !prev[code] }))
                }
                style={{
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <h2 style={{ margin: 0 }}>{title}</h2>
                  <p style={{ margin: 0, fontSize: 14, color: "#555" }}>
                    {renderFlags(flags)}
                  </p>
                </div>

                <span style={{ fontSize: 24 }}>
                  {open[code] ? "▲" : "▼"}
                </span>
              </div>

              {/* サムネ */}
              {info.thumbnail && (
                <div style={{ marginTop: 12, textAlign: "center" }}>
                  <img
                    src={`/gacha/${info.thumbnail}`}
                    style={{
                      width: "100%",
                      maxWidth: 240,
                      borderRadius: 12,
                      boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                    }}
                  />
                </div>
              )}

              {/* 折りたたみ内容 */}
              {open[code] && (
                <div style={{ marginTop: 16 }}>
                  <FrameList
                    items={items}
                    framesMeta={info.frames}
                    mode={info.mode}
                    currentUid={currentUid}
                    filterMine={filterMine}
                    search={search}
                    sortOrder={sortOrder}
                  />
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

/* --------------------------------------------------
   枠ごとの表示（履歴ベース）
-------------------------------------------------- */
function FrameList({
  items,
  framesMeta,
  mode,
  currentUid,
  filterMine,
  search,
  sortOrder,
}: any) {
  return (
    <div>
      {framesMeta.map((f: any) => {
        const frameName = f.label;

        let list = items.filter((r: any) => r.frame === frameName);

        if (filterMine && currentUid) {
          list = list.filter((r: any) => r.uid === currentUid);
        }

        if (search.trim()) {
          const s = search.trim().toLowerCase();
          list = list.filter(
            (r: any) =>
              r.frame.toLowerCase().includes(s) ||
              r._userName.includes(s)
          );
        }

        list = list.sort((a: any, b: any) => {
          const aSec = a.createdAt?._seconds ?? 0;
          const bSec = b.createdAt?._seconds ?? 0;
          return sortOrder === "new" ? bSec - aSec : aSec - bSec;
        });

        return (
          <div key={frameName} style={{ marginBottom: 20 }}>
            <h3>
              {frameName}{" "}
              {mode === "count"
                ? `（${list.length}/${f.maxCount}）`
                : `（${Math.round(f.probability * 100)}%）`}
            </h3>

            {list.length === 0 ? (
              <p style={{ marginLeft: 20 }}>当選者なし</p>
            ) : (
              <ul style={{ paddingLeft: 20 }}>
                {list.map((r: any) => (
                  <UserResultItem
                    key={r.id}
                    result={r}
                    highlight={currentUid === r.uid}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------
   ユーザー表示
-------------------------------------------------- */
function UserResultItem({ result, highlight }: any) {
  return (
    <li
      style={{
        marginBottom: 4,
        fontWeight: highlight ? "bold" : "normal",
        color: highlight ? "#2563eb" : "black",
      }}
    >
      {result.userName}：{result.reward} pt
      {highlight && " ← あなた"}
    </li>
  );
}

/* --------------------------------------------------
   外側：Suspense
-------------------------------------------------- */
export default function GachaResultsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>読み込み中…</div>}>
      <ResultsContent />
    </Suspense>
  );
}
