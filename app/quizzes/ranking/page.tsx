"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { collection, getDocs } from "firebase/firestore";
import Link from "next/link";

export default function QuizRankingPage() {
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 折りたたみ状態
  const [openQuizId, setOpenQuizId] = useState<string | null>(null);

  // 回答読み込み状態
  const [answers, setAnswers] = useState<Record<string, any[]>>({});
  const [answersLoading, setAnswersLoading] = useState<Record<string, boolean>>({});

  // ★ 完了済みクイズを取得 → 回答数順に並び替え
  const fetchQuizzes = async () => {
    const snap = await getDocs(collection(db, "quizzes_archive"));
    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    // 回答数を取得するために answers コレクションを読む
    const withCounts = await Promise.all(
      list.map(async (q) => {
        const ansSnap = await getDocs(collection(db, "quizzes_archive", q.id, "answers"));
        return {
          ...q,
          answerCount: ansSnap.size,
        };
      })
    );

    // 回答数の多い順に並び替え
    withCounts.sort((a, b) => b.answerCount - a.answerCount);

    setQuizzes(withCounts);
    setLoading(false);
  };

  useEffect(() => {
    fetchQuizzes();
  }, []);

  // ★ 折りたたみを開いた瞬間に回答を読み込む
  const loadAnswers = async (quizId: string) => {
    setAnswersLoading((prev) => ({ ...prev, [quizId]: true }));

    const snap = await getDocs(collection(db, "quizzes_archive", quizId, "answers"));
    const list = snap.docs.map((d) => ({
      uid: d.id,
      ...d.data(),
    }));

    setAnswers((prev) => ({ ...prev, [quizId]: list }));
    setAnswersLoading((prev) => ({ ...prev, [quizId]: false }));
  };

  const toggleOpen = (quizId: string) => {
    if (openQuizId === quizId) {
      setOpenQuizId(null);
      return;
    }

    setOpenQuizId(quizId);

    // 初回だけ読み込む
    if (!answers[quizId]) {
      loadAnswers(quizId);
    }
  };

  if (loading) return <p style={{ padding: 20 }}>読み込み中…</p>;

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>クイズランキング（回答数順）</h1>

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
        クイズ一覧に戻る
      </Link>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {quizzes.map((q, index) => (
          <div
            key={q.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 16,
            }}
          >
            {/* ランキング番号 */}
            <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 8 }}>
              #{index + 1}
            </div>

            {/* クイズ本体 */}
            <div style={{ display: "flex", gap: 16 }}>
              <img
                src={q.thumbnail}
                alt={q.title}
                style={{ width: 80, height: 80, objectFit: "cover" }}
              />

              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 20 }}>{q.title}</h2>
                <p style={{ color: "#555" }}>回答数：{q.answerCount}件</p>
              </div>

              <button
                onClick={() => toggleOpen(q.id)}
                style={{
                  padding: "8px 12px",
                  background: "#2563eb",
                  color: "white",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  height: 40,
                }}
              >
                {openQuizId === q.id ? "閉じる" : "詳細"}
              </button>
            </div>

            {/* 折りたたみ部分 */}
            {openQuizId === q.id && (
              <div style={{ marginTop: 16, paddingLeft: 8 }}>

                {/* 読み込み中 */}
                {answersLoading[q.id] && <p>読み込み中…</p>}

                {/* 読み込み完了 */}
                {!answersLoading[q.id] && (
                  <div>
                    {/* ★ クイズ詳細情報 */}
                    <h3 style={{ marginTop: 10 }}>正解：{q.answer}</h3>

                    {q.explanation && (
                      <p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
                        {q.explanation}
                      </p>
                    )}

                    <p style={{ marginTop: 8 }}>
                      山分けポイント：{q.rewardPoint}pt
                    </p>

                    {/* ★ 回答一覧 */}
                    <p style={{ marginTop: 16 }}>
                      回答一覧（{answers[q.id]?.length ?? 0}件）
                    </p>

                    {answers[q.id]?.map((a) => (
                      <div
                        key={a.uid}
                        style={{
                          padding: "8px 12px",
                          borderBottom: "1px solid #eee",
                        }}
                      >
                        <strong>{a.uid}</strong>：{a.answer}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
