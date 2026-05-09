"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions, db } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function AdminGachaResultsPage() {
  const [results, setResults] = useState<any[]>([]);
  const [grouped, setGrouped] = useState<any>({});
  const [open, setOpen] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    loadResults();
  }, []);

  const loadResults = async () => {
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
  };

  // ★ ユーザー情報取得（displayName + Xアカウント）
  const getUserInfo = async (uid: string) => {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return "不明なユーザー";

    const u = snap.data();
    return u.displayName || u.xAccount || "名無し";
  };

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ textAlign: "center", marginBottom: 20 }}>
        🗂 管理者用：ガチャ結果一覧
      </h1>

      {Object.keys(grouped).length === 0 && <p>結果がありません。</p>}

      {Object.entries(grouped).map(([code, items]: any) => {
        const title = items[0]?.title ?? "（タイトルなし）";

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
              <h2 style={{ margin: 0 }}>{title}</h2>
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
  // 枠名ごとにグループ化
  const frames: any = {};
  for (const r of items) {
    const key = r.frameName;
    if (!frames[key]) frames[key] = [];
    frames[key].push(r);
  }

  return (
    <div>
      {Object.entries(frames).map(([frameName, list]: any) => {
        // ★ reward 昇順
        const sorted = list.sort((a: any, b: any) => a.reward - b.reward);

        return (
          <div key={frameName} style={{ marginBottom: 20 }}>
            <h3>{frameName}（{sorted.length} 件）</h3>

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
   ユーザー表示（displayName / xAccount）
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
