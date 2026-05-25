"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions, db } from "@/firebase";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";

export default function AdminGachaResultsPage() {
  const [results, setResults] = useState<any[]>([]);
  const [grouped, setGrouped] = useState<any>({});
  const [open, setOpen] = useState<{ [key: string]: boolean }>({});
  const [gachaInfo, setGachaInfo] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadResults();
  }, []);

  const loadResults = async () => {
    setLoading(true);

    // ★ サブコレクション対応済みの getGachaResults を呼ぶ
    const fn = httpsCallable(functions, "getGachaResults");
    const res: any = await fn();

    const list = res.data || [];

    // ★ ガチャコードごとにグループ化
    const groupedData: any = {};
    for (const r of list) {
      if (!groupedData[r.code]) groupedData[r.code] = [];
      groupedData[r.code].push(r);
    }

    setResults(list);
    setGrouped(groupedData);

    // ★ gachaCodes を取得して publicFlags / xAccountList を紐づける
    const snap = await getDocs(collection(db, "gachaCodes"));
    const info: any = {};
    snap.docs.forEach((d) => {
      info[d.id] = d.data();
    });
    setGachaInfo(info);

    setLoading(false);
  };

  // ★ ユーザー情報取得
  const getUserInfo = async (uid: string) => {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return "不明なユーザー";

    const u = snap.data();
    return u.displayName || u.xAccount || "名無し";
  };

  // ★ publicFlags を人間向けに変換
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
        Object.entries(grouped).map(([code, items]: any) => {
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

                  {/* Xアカウント一致ガチャの場合 */}
                  {flags.includes("x_account_match") && (
                    <div
                      style={{
                        marginTop: 6,
                        padding: 8,
                        background: "#f9fafb",
                        border: "1px solid #eee",
                        borderRadius: 6,
                        fontSize: 13,
                      }}
                    >
                      <strong>対象Xアカウント（貼り付けテキスト）</strong>
                      <pre
                        style={{
                          whiteSpace: "pre-wrap",
                          marginTop: 6,
                          background: "#fff",
                          padding: 8,
                          borderRadius: 4,
                          border: "1px solid #ddd",
                        }}
                      >
                        {xList.join("\n")}
                      </pre>
                    </div>
                  )}
                </div>

                <span style={{ fontSize: 24 }}>
                  {open[code] ? "▲" : "▼"}
                </span>
              </div>

              {/* 折りたたみ内容 */}
              {open[code] && (
                <div style={{ marginTop: 16 }}>
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
function renderFrames(items: any[], getUserInfo: any) {
  const frames: any = {};
  for (const r of items) {
    const key = r.frameName;
    if (!frames[key]) frames[key] = [];
    frames[key].push(r);
  }

  return (
    <div>
      {Object.entries(frames).map(([frameName, list]: any) => {
        const sorted = list.sort((a: any, b: any) => a.reward - b.reward);

        return (
          <div key={frameName} style={{ marginBottom: 20 }}>
            <h3>
              {frameName}（{sorted.length} 件）
            </h3>

            <ul style={{ paddingLeft: 20 }}>
              {sorted.map((r: any) => (
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
function UserResultItem({ result, getUserInfo }: any) {
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
