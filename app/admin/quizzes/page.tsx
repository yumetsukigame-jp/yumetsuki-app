"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import Link from "next/link";

export default function AdminQuizListPage() {
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQuizzes = async () => {
    const snap = await getDocs(collection(db, "quizzes"));
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

  const archiveQuiz = async (id: string) => {
    if (!confirm("このクイズをアーカイブしますか？")) return;

    await updateDoc(doc(db, "quizzes", id), {
      archived: true,
    });

    alert("アーカイブしました");
    fetchQuizzes();
  };

  /* --------------------------------------------------
     ★ クイズ削除（answers サブコレクションも削除）
  -------------------------------------------------- */
  const deleteQuiz = async (id: string) => {
    if (!confirm("このクイズを完全に削除しますか？\n回答データも消えます。")) return;

    // answers サブコレクション削除
    const answersSnap = await getDocs(collection(db, "quizzes", id, "answers"));
    for (const a of answersSnap.docs) {
      await deleteDoc(a.ref);
    }

    // クイズ本体削除
    await deleteDoc(doc(db, "quizzes", id));

    alert("削除しました");
    fetchQuizzes();
  };

  if (loading) return <p style={{ padding: 20 }}>読み込み中…</p>;

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>クイズ一覧（管理）</h1>

      <Link
        href="/admin/quizzes/add"
        style={{
          display: "inline-block",
          marginBottom: 20,
          padding: "10px 16px",
          background: "#4f46e5",
          color: "white",
          borderRadius: 8,
          textDecoration: "none",
        }}
      >
        ＋ クイズを作成
      </Link>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {quizzes.map((q) => (
          <div
            key={q.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 16,
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <img
              src={q.thumbnail}
              alt={q.title}
              style={{ width: 80, height: 80, objectFit: "cover" }}
            />

            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 20 }}>{q.title}</h2>
              <p>回答回数：{q.maxAnswers}</p>
              <p>アーカイブ：{q.archived ? "はい" : "いいえ"}</p>
            </div>

            {/* 編集 */}
            <Link
              href={`/admin/quizzes/edit/${q.id}`}
              style={{
                padding: "8px 12px",
                background: "#10b981",
                color: "white",
                borderRadius: 6,
                textDecoration: "none",
              }}
            >
              編集
            </Link>

            {/* アーカイブ */}
            <button
              onClick={() => archiveQuiz(q.id)}
              style={{
                padding: "8px 12px",
                background: "#f59e0b",
                color: "white",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
              }}
            >
              アーカイブ
            </button>

            {/* ★ 削除ボタン */}
            <button
              onClick={() => deleteQuiz(q.id)}
              style={{
                padding: "8px 12px",
                background: "#ef4444",
                color: "white",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
              }}
            >
              削除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
