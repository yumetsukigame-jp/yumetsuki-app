"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions, db, auth } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useSearchParams, useRouter } from "next/navigation";

export default function GachaResultsPage() {
  const [grouped, setGrouped] = useState<any>({});
  const [open, setOpen] = useState<{ [key: string]: boolean }>({});
  const [titles, setTitles] = useState<{ [key: string]: string }>({});
  const [meta, setMeta] = useState<{ [key: string]: any }>({});

  const [filterMine, setFilterMine] = useState(false);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"new" | "old">("new");

  const searchParams = useSearchParams();
  const router = useRouter();

  const filterCode = searchParams.get("code") ?? null;
  const currentUid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    loadResults();
  }, []);

  const loadResults = async () => {
    const fn = httpsCallable(functions, "getGachaResults");
    const res: any = await fn();

    const list = res.data || [];

    // ★ ガチャコードで絞り込み
    let filtered = filterCode
      ? list.filter((r: any) => r.code === filterCode)
      : list;

    // ★ ガチャコードごとにグループ化
    const groupedData: any = {};
    for (const r of filtered) {
      if (!groupedData[r.code]) groupedData[r.code] = [];
      groupedData[r.code].push(r);
    }

    // ★ Firestore からタイトル・公開設定・枠情報を取得
    const titleMap: any = {};
    const metaMap: any = {};

    for (const code of Object.keys(groupedData)) {
      const snap = await getDoc(doc(db, "gachaCodes", code));
      if (snap.exists()) {
        const d = snap.data();
        titleMap[code] = d.title ?? "（タイトルなし）";
        metaMap[code] = {
          public: d.public ?? false,
          frames: d.frames ?? [],
          mode: d.mode,
        };
      } else {
        titleMap[code] = "（タイトルなし）";
        metaMap[code] = { public: false, frames: [], mode: "count" };
      }
    }

    // ★ 限定ガチャは「自分が引いたものだけ」残す
    if (!filterCode && currentUid) {
      for (const code of Object.keys(groupedData)) {
        const info = metaMap[code];

        if (!info.public) {
          const hasMine = groupedData[code].some(
            (r: any) => r.uid === currentUid
          );
          if (!hasMine) {
            delete groupedData[code];
          }
        }
      }
    }

    setGrouped(groupedData);
    setTitles(titleMap);
    setMeta(metaMap);
  };

  // ★ displayName + Xアカウント
  const getUserInfo = async (uid: string) => {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return "不明なユーザー";

    const u = snap.data();
    return u.displayName || u.xAccount || "名無し";
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

      {Object.keys(grouped).length === 0 && <p>結果がありません。</p>}

      {Object.entries(grouped).map(([code, items]: any) => {
        const title = titles[code] ?? "（タイトルなし）";
        const info = meta[code] ?? {};

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
                  {info.public ? "🌐 公開" : "🔒 限定"}
                </p>
              </div>
              <span style={{ fontSize: 24 }}>
                {open[code] ? "▲" : "▼"}
              </span>
            </div>

            {/* 折りたたみ内容 */}
            {open[code] && (
              <div style={{ marginTop: 16 }}>
                <FrameList
                  items={items}
                  framesMeta={info.frames}
                  mode={info.mode}
                  getUserInfo={getUserInfo}
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

/* ------------------------------------------
   枠ごとの表示（全枠表示 + reward昇順 + 検索 + フィルタ）
------------------------------------------ */
function FrameList({
  items,
  framesMeta,
  mode,
  getUserInfo,
  currentUid,
  filterMine,
  search,
  sortOrder,
}: any) {
  return (
    <div>
      {framesMeta.map((f: any) => {
        const frameName = f.label;

        // ★ 該当枠の結果
        let list = items.filter((r: any) => r.frameName === frameName);

        // ★ 自分の結果だけ表示
        if (filterMine && currentUid) {
          list = list.filter((r: any) => r.uid === currentUid);
        }

        // ★ 検索（ユーザー名 / 枠名）
        if (search.trim()) {
          const s = search.trim().toLowerCase();
          list = list.filter(
            (r: any) =>
              r.frameName.toLowerCase().includes(s) ||
              r.userName?.toLowerCase().includes(s)
          );
        }

        // ★ 並び替え（createdAt）
        list = list.sort((a: any, b: any) =>
          sortOrder === "new"
            ? b.createdAt._seconds - a.createdAt._seconds
            : a.createdAt._seconds - b.createdAt._seconds
        );

        return (
          <div key={frameName} style={{ marginBottom: 20 }}>
            <h3>
              {frameName}{" "}
              {mode === "count"
                ? `（${f.usedCount}/${f.maxCount}）`
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
                    getUserInfo={getUserInfo}
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

/* ------------------------------------------
   ユーザー表示（displayName / xAccount）
------------------------------------------ */
function UserResultItem({ result, getUserInfo, highlight }: any) {
  const [name, setName] = useState("読み込み中…");

  useEffect(() => {
    (async () => {
      const n = await getUserInfo(result.uid);
      setName(n);
    })();
  }, []);

  return (
    <li
      style={{
        marginBottom: 4,
        fontWeight: highlight ? "bold" : "normal",
        color: highlight ? "#2563eb" : "black",
      }}
    >
      {name}：{result.reward} pt
      {highlight && " ← あなた"}
    </li>
  );
}
