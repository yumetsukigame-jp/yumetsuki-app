"use client";

import { useEffect, useState } from "react";
import { functions } from "@/firebase";
import { httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";

export default function PublicGachaListPage() {
  const [gachas, setGachas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const fn = httpsCallable(functions, "getPublicGachaList");
    const res: any = await fn();
    setGachas(res.data || []);
    setLoading(false);
  };

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 20 }}>🌟 公開ガチャ一覧</h1>

      {loading && <p>読み込み中…</p>}

      {!loading && gachas.length === 0 && (
        <p>現在、公開されているガチャはありません。</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {gachas.map((g) => {
          const remaining =
            g.mode === "count"
              ? g.totalCount -
                g.frames.reduce((a: number, f: any) => a + (f.usedCount ?? 0), 0)
              : "∞";

          return (
            <div
              key={g.code}
              onClick={() => router.push(`/gacha/${g.code}`)}
              style={{
                padding: 16,
                borderRadius: 12,
                background: "white",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                cursor: "pointer",
              }}
            >
              <h2 style={{ margin: 0, color: "#2563eb" }}>{g.title}</h2>

              <p style={{ margin: "6px 0" }}>
                方式：{g.mode === "count" ? "枠数方式" : "確率方式"}
              </p>

              <p style={{ margin: "6px 0" }}>
                1回 {g.point.cost} pt（上限 {g.point.maxPerUser} 回）
              </p>

              <p style={{ margin: "6px 0" }}>
                残数：{remaining}
              </p>

              <p style={{ margin: "6px 0", fontSize: 14, color: "#555" }}>
                締切：{g.expiresAt?.toDate().toLocaleString() ?? "なし"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
