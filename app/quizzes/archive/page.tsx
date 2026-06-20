"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { collection, getDocs } from "firebase/firestore";
import Link from "next/link";

export default function QuizArchivePage() {
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [openQuizId, setOpenQuizId] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, any[]>>({});
  const [answersLoading, setAnswersLoading] = useState<Record<string, boolean>>({});

  const fetchQuizzes = async () => {
    const snap = await getDocs(collection(db, "quizzes_archive"));
    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    setQuizzes(list);
    setLoading(false);
  };

  useEffect(() => {
    fetchQuizzes();
  }, []);

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

    if (!answers[quizId]) {
      loadAnswers(quizId);
    }
  };

  if (loading) return <p style={{ padding: 20 }}>読み込み中…</p>;

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

            {openQuizId === q.id && (
              <div style={{ marginTop: 16, paddingLeft: 8 }}>
                {answersLoading[q.id] && <p>読み込み中…</p>}

                {!answersLoading[q.id] && (
                  <div>
                    {/* 正解 */}
                    <h3 style={{ marginTop: 10 }}>正解：{q.answer}</h3>

                    {/* 解説 */}
                    {q.explanation && (
                      <p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
                        {q.explanation}
                      </p>
                    )}

                    {/* ★ 改ざん防止情報 */}
                    <div
                      style={{
                        marginTop: 16,
                        padding: 12,
                        background: "#f3f4f6",
                        borderRadius: 8,
                      }}
                    >
                      <h4 style={{ marginBottom: 8 }}>改ざん防止情報</h4>
                      <p><strong>salt：</strong>{q.salt}</p>
                      <p><strong>thread（SHA-256）：</strong>{q.thread}</p>

                      <p style={{ marginTop: 8, fontSize: 14, color: "#555" }}>
                        ※ 正解 + "-" + salt を SHA-256 でハッシュ化した値が thread と一致しているか確認できます。
                      </p>
                    </div>

                    {/* 回答一覧 */}
                    <p style={{ marginTop: 16 }}>
                      回答数：{answers[q.id]?.length ?? 0}件
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
