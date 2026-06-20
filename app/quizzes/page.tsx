"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { collection, getDocs } from "firebase/firestore";
import Link from "next/link";

export default function QuizListPage() {
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [openMap, setOpenMap] = useState<Record<string, boolean>>({}); // ★ ハッシュ折りたたみ

  const fetchQuizzes = async () => {
    const snap = await getDocs(collection(db, "quizzes"));
    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    // archived = false のみ表示
    setQuizzes(list.filter((q) => !q.archived));
    setLoading(false);
  };

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const toggleOpen = (id: string) => {
    setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) return <p style={{ padding: 20 }}>読み込み中…</p>;

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>ゆめつきクイズ</h1>

      {/* ★ 完了済みクイズへのリンク */}
      <Link
        href="/quizzes/archive"
        style={{
          display: "inline-block",
          marginBottom: 20,
          padding: "8px 12px",
          background: "#4f46e5",
          color: "white",
          borderRadius: 8,
          textDecoration: "none",
        }}
      >
        完了済みクイズを見る
      </Link>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {quizzes.map((q) => {
          const isOpen = openMap[q.id] ?? false;

          return (
            <div
              key={q.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 16,
              }}
            >
              {/* クイズカード全体をリンクに */}
              <Link
                href={`/quizzes/${q.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <img
                  src={q.thumbnail}
                  alt={q.title}
                  style={{ width: 80, height: 80, objectFit: "cover" }}
                />

                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: 20 }}>{q.title}</h2>

                  {/* ★ 山分け前ポイント表示 */}
                  <p style={{ color: "#444", marginTop: 4 }}>
                    山分けポイント：<strong>{q.rewardPoint} pt</strong>
                  </p>

                  <p style={{ color: "#555" }}>回答回数：{q.maxAnswers}</p>
                </div>
              </Link>

              {/* ▼ ハッシュ折りたたみ */}
              <button
                onClick={() => toggleOpen(q.id)}
                style={{
                  marginTop: 12,
                  padding: "6px 10px",
                  background: "#4f46e5",
                  color: "white",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {isOpen ? "ハッシュを閉じる" : "ハッシュを見る"}
              </button>

              {isOpen && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    background: "#f3f4f6",
                    borderRadius: 8,
                  }}
                >
                  <h4 style={{ marginBottom: 8 }}>改ざん防止ハッシュ（thread）</h4>
                  <p style={{ fontSize: 14, wordBreak: "break-all" }}>
                    {q.thread}
                  </p>

                  <p style={{ marginTop: 8, fontSize: 13, color: "#555" }}>
                    ※ 正解確定前のため salt は非公開です。
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ▼ ハッシュ値の注釈（一覧ページ下部） */}
      <p style={{ marginTop: 30, fontSize: 13, color: "#555" }}>
        ※ thread（改ざん防止ハッシュ）は、クイズの正解と salt を組み合わせて  
        SHA-256 でハッシュ化した値です。  
        運営側が後から正解を変更していないことを、誰でも確認できます。
      </p>
    </div>
  );
}
