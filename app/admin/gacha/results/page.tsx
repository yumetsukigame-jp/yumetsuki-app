"use client";

import type { DocumentData } from "firebase/firestore";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions, db } from "@/firebase";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";

// functions/src/common/normalize.ts の normalizeX と同じ正規化ルール
function normalizeX(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[\s\r\n\t]+/g, "")
    .replace(/[()（）【】［］]/g, "")
    .replace(/[@＠]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

async function computeXDrawnCounts(
  groupedData: Record<string, DocumentData[]>,
  info: Record<string, DocumentData>
) {
  const counts: Record<string, number> = {};

  for (const [code, items] of Object.entries(groupedData)) {
    const flags = info[code]?.publicFlags ?? [];
    if (!flags.includes("x_account_match")) continue;

    const xList = (info[code]?.xAccountList ?? [])
      .filter((s: string) => s.includes("@"))
      .map((s: string) => normalizeX(s));
    if (xList.length === 0) continue;

    const uniqueUids = Array.from(new Set(items.map((r: DocumentData) => r.uid)));
    const matchedUids = new Set<string>();

    for (const uid of uniqueUids) {
      const userSnap = await getDoc(doc(db, "users", uid));
      if (!userSnap.exists()) continue;
      const userX = normalizeX(userSnap.data()?.xAccount);
      if (userX && xList.some((entry: string) => entry.includes(userX))) {
        matchedUids.add(uid);
      }
    }

    counts[code] = matchedUids.size;
  }

  return counts;
}

export default function AdminGachaResultsPage() {
  const [results, setResults] = useState<DocumentData[]>([]);
  const [grouped, setGrouped] = useState<Record<string, DocumentData[]>>({});
  const [open, setOpen] = useState<{ [key: string]: boolean }>({});
  const [xOpen, setXOpen] = useState<{ [key: string]: boolean }>({}); // ★ Xアカ用折りたたみ
  const [gachaInfo, setGachaInfo] = useState<Record<string, DocumentData>>({});
  const [xDrawnCounts, setXDrawnCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);


  async function loadResults() {
    setLoading(true);

    const fn = httpsCallable(functions, "getGachaResults");
    const res: DocumentData = await fn();

    const list = res.data || [];

    const groupedData: DocumentData = {};
    for (const r of list) {
      if (!groupedData[r.code]) groupedData[r.code] = [];
      groupedData[r.code].push(r);
    }

    setResults(list);
    setGrouped(groupedData);

    const snap = await getDocs(collection(db, "gachaCodes"));
    const info: DocumentData = {};
    snap.docs.forEach((d) => {
      info[d.id] = d.data();
    });
    setGachaInfo(info);

    setXDrawnCounts(await computeXDrawnCounts(groupedData, info));

    setLoading(false);
  }
  useEffect(() => {
    void Promise.resolve().then(loadResults);
  }, []);

  const getUserInfo = async (uid: string) => {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return "不明なユーザー";

    const u = snap.data();
    return u.displayName || u.xAccount || "名無し";
  };

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
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ textAlign: "center", marginBottom: 20 }}>
        🗂 管理者用：ガチャ結果一覧
      </h1>

      {loading && <p>読み込み中…</p>}

      {!loading && Object.keys(grouped).length === 0 && (
        <p>結果がありません。</p>
      )}

      {!loading &&
        Object.entries(grouped).map(([code, items]) => {
          const title = items[0]?.title ?? "（タイトルなし）";
          const info = gachaInfo[code] ?? {};
          const flags = info.publicFlags ?? [];
          const xList = info.xAccountList ?? [];

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
                    公開設定：{renderFlags(flags)}
                  </p>
                </div>

                <span style={{ fontSize: 24 }}>
                  {open[code] ? "▲" : "▼"}
                </span>
              </div>

              {/* 折りたたみ内容 */}
              {open[code] && (
                <div style={{ marginTop: 16 }}>
                  {/* ★ Xアカウント一致ガチャなら折りたたみ表示 */}
                  {flags.includes("x_account_match") && (
                    <div style={{ marginBottom: 16 }}>
                      <p style={{ margin: "0 0 6px", fontWeight: "bold" }}>
                        抽選済み人数：{xDrawnCounts[code] ?? 0} / {xList.length} 件
                      </p>

                      <button
                        onClick={() =>
                          setXOpen((prev) => ({
                            ...prev,
                            [code]: !prev[code],
                          }))
                        }
                        style={{
                          padding: "8px 12px",
                          background: "#f3f4f6",
                          border: "1px solid #ddd",
                          borderRadius: 6,
                          cursor: "pointer",
                          width: "100%",
                          textAlign: "left",
                        }}
                      >
                        対象Xアカウント一覧 {xOpen[code] ? "▲" : "▼"}
                      </button>

                      {xOpen[code] && (
                        <pre
                          style={{
                            whiteSpace: "pre-wrap",
                            marginTop: 6,
                            background: "#fff",
                            padding: 12,
                            borderRadius: 6,
                            border: "1px solid #ddd",
                          }}
                        >
                          {xList.join("\n")}
                        </pre>
                      )}
                    </div>
                  )}

                  {renderFrames(items, getUserInfo)}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

/* ------------------------------------------
   枠ごとの表示（reward 昇順）
------------------------------------------ */
function renderFrames(
  items: DocumentData[],
  getUserInfo: (uid: string) => Promise<string>
) {
  const frames: Record<string, DocumentData[]> = {};
  for (const r of items) {
    const key = r.frameName;
    if (!frames[key]) frames[key] = [];
    frames[key].push(r);
  }

  return (
    <div>
      {Object.entries(frames).map(([frameName, list]) => {
        const sorted = list.sort((a: DocumentData, b: DocumentData) => a.reward - b.reward);

        return (
          <div key={frameName} style={{ marginBottom: 20 }}>
            <h3>
              {frameName}（{sorted.length} 件）
            </h3>

            <ul style={{ paddingLeft: 20 }}>
              {sorted.map((r: DocumentData) => (
                <UserResultItem key={r.id} result={r} getUserInfo={getUserInfo} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------
   ユーザー表示
------------------------------------------ */
function UserResultItem({
  result,
  getUserInfo,
}: {
  result: DocumentData;
  getUserInfo: (uid: string) => Promise<string>;
}) {
  const [name, setName] = useState("読み込み中…");

  useEffect(() => {
    (async () => {
      const n = await getUserInfo(result.uid);
      setName(n);
    })();
  }, []);

  return (
    <li style={{ marginBottom: 4 }}>
      {name}：{result.reward} pt
    </li>
  );
}
