"use client";

import type { DocumentData } from "firebase/firestore";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { collection, getDocs } from "firebase/firestore";
import Link from "next/link";
import LoadingState from "@/app/components/LoadingState";
import { withRetry } from "@/app/lib/retry";

export default function QuizArchivePage() {
  const [quizzes, setQuizzes] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQuizzes = async () => {
    try {
      const snap = await withRetry(() => getDocs(collection(db, "quizzes_archive")));
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setQuizzes(list);
    } catch (error) {
      console.error("完了済みクイズの読み込みに失敗しました", error);
      setQuizzes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchQuizzes);
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>完了済みクイズ</h1>

      <Link
        href="/quizzes"
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
        現在のクイズに戻る
      </Link>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {quizzes.map((q) => (
          <div
            key={q.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 16,
            }}
          >
            <div style={{ display: "flex", gap: 16 }}>
              <img
                src={q.thumbnail}
                alt={q.title}
                style={{ width: 80, height: 80, objectFit: "cover" }}
              />

              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 20 }}>{q.title}</h2>
                <p style={{ color: "#555" }}>山分けポイント：{q.rewardPoint}</p>
              </div>

              <Link
                href={`/quizzes/archive/${q.id}`}
                style={{
                  padding: "8px 12px",
                  background: "#2563eb",
                  color: "white",
                  borderRadius: 6,
                  textDecoration: "none",
                  display: "inline-block",
                  height: 40,
                }}
              >
                詳細ページへ
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
