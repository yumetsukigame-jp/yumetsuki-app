"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
} from "firebase/firestore";

export default function AdminGachaListPage() {
  const [codes, setCodes] = useState<any[]>([]);
  const [archiveCodes, setArchiveCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ★ どちらを表示するか
  const [view, setView] = useState<"active" | "archive">("active");

  // ★ アーカイブは初回だけ読み込む
  const [archiveLoaded, setArchiveLoaded] = useState(false);

  /* -----------------------------------------
     現役ガチャ読み込み
  ----------------------------------------- */
  const loadCodes = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, "gachaCodes"));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setCodes(list);
    setLoading(false);
  };

  /* -----------------------------------------
     アーカイブ読み込み（遅延）
  ----------------------------------------- */
  const loadArchive = async () => {
    if (archiveLoaded) return; // 2回目以降は読み込まない

    setLoading(true);
    const snap = await getDocs(collection(db, "gachaCodesArchive"));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setArchiveCodes(list);
    setArchiveLoaded(true);
    setLoading(false);
  };

  /* -----------------------------------------
     削除（現役のみ）
  ----------------------------------------- */
  const deleteCode = async (id: string) => {
    if (!confirm("本当に削除しますか？")) return;
    await deleteDoc(doc(db, "gachaCodes", id));
    await loadCodes();
  };

  useEffect(() => {
    loadCodes();
  }, []);

  /* -----------------------------------------
     publicFlags を人間向けに変換
  ----------------------------------------- */
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

  /* -----------------------------------------
     表示するリストを決定
  ----------------------------------------- */
  const listToShow = view === "active" ? codes : archiveCodes;

  return (
    <div style={{ padding: 24 }}>
      <h1>🎛 ガチャ管理一覧</h1>

      {/* ▼ 表示切り替えタブ */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => setView("active")}
          style={{
            flex: 1,
            padding: 10,
            background: view === "active" ? "#2563eb" : "#6b7280",
            color: "white",
            borderRadius: 8,
            border: "none",
          }}
        >
          現役ガチャ
        </button>

        <button
          onClick={async () => {
            setView("archive");
            await loadArchive(); // ★ 遅延読み込み
          }}
          style={{
            flex: 1,
            padding: 10,
            background: view === "archive" ? "#2563eb" : "#6b7280",
            color: "white",
            borderRadius: 8,
            border: "none",
          }}
        >
          アーカイブ
        </button>
      </div>

      {loading && <p>読み込み中…</p>}

      {!loading && listToShow.length === 0 && (
        <p>{view === "active" ? "ガチャがありません。" : "アーカイブは空です。"}</p>
      )}

      {/* ▼ ガチャ一覧（現役 or アーカイブ） */}
      {listToShow.map((c) => (
        <div
          key={c.id}
          style={{
            border: "1px solid #ccc",
            padding: 16,
            borderRadius: 8,
            marginBottom: 16,
            background: "white",
          }}
        >
          {/* サムネイル */}
          {c.thumbnail && (
            <div style={{ marginBottom: 12 }}>
              <img
                src={`/gacha/${c.thumbnail}`}
                style={{
                  width: 120,
                  height: 120,
                  objectFit: "cover",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                }}
              />
            </div>
          )}

          <h2 style={{ marginBottom: 8 }}>
            {c.title}
            {view === "archive" && (
              <span style={{ marginLeft: 8, color: "#6b7280" }}>（アーカイブ）</span>
            )}
          </h2>

          <p style={{ margin: "4px 0" }}>
            コード：<strong>{c.code}</strong>
          </p>

          <p style={{ margin: "4px 0" }}>
            種類：{renderFlags(c.publicFlags)}
          </p>

          {c.publicFlags?.includes("x_account_match") && (
            <div
              style={{
                marginTop: 8,
                padding: 8,
                background: "#f9fafb",
                border: "1px solid #eee",
                borderRadius: 6,
              }}
            >
              <strong>対象Xアカウント</strong>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  marginTop: 6,
                  fontSize: 13,
                  background: "#fff",
                  padding: 8,
                  borderRadius: 4,
                  border: "1px solid #ddd",
                }}
              >
                {(c.xAccountList ?? []).join("\n")}
              </pre>
            </div>
          )}

          <p style={{ margin: "4px 0" }}>
            抽選方式：{c.mode === "count" ? "枠数方式" : "確率方式"}
          </p>

          <p style={{ margin: "4px 0" }}>
            リセット：{c.resetType === "daily" ? "デイリー（毎日6時）" : "なし"}
          </p>

          <p style={{ margin: "4px 0" }}>
            期限：
            {c.expiresAt?.toDate
              ? c.expiresAt.toDate().toLocaleString()
              : "なし"}
          </p>

          <h3 style={{ marginTop: 12 }}>枠情報</h3>

          {c.frames.map((f: any, i: number) => (
            <div
              key={i}
              style={{
                padding: 8,
                border: "1px solid #eee",
                borderRadius: 6,
                marginBottom: 6,
              }}
            >
              <strong>{f.label}</strong>

              {c.mode === "count" && (
                <div>
                  使用数：{f.usedCount} / {f.maxCount ?? "∞"}
                </div>
              )}

              {c.mode === "probability" && (
                <div>確率：{(f.probability * 100).toFixed(1)}%</div>
              )}

              <div>
                報酬：{f.rewardMin} ～ {f.rewardMax}
              </div>

              <div>発送：{f.shippingEnabled ? "📦 あり" : "なし"}</div>
            </div>
          ))}

          {/* ボタン */}
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => navigator.clipboard.writeText(c.code)}
              style={{
                marginRight: 10,
                padding: "6px 12px",
                background: "#2563eb",
                color: "white",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
              }}
            >
              コードをコピー
            </button>

            {view === "active" && (
              <button
                onClick={() => deleteCode(c.id)}
                style={{
                  padding: "6px 12px",
                  background: "#dc2626",
                  color: "white",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                削除
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
