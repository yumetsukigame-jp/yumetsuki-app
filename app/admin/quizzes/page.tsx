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
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase"; // Functions 呼び出し用

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

  /* --------------------------------------------------
     ★ 解答確定（Cloud Functions 呼び出し）
  -------------------------------------------------- */
  const confirmQuiz = async (id: string) => {
    if (
      !confirm(
        "このクイズの解答を確定しますか？\n正解者へのポイント付与とアーカイブ移動が行われます。"
      )
    )
      return;

    try {
      const fn = httpsCallable(functions, "confirmQuizAnswer");
      const res = await fn({ quizId: id });

      console.log("confirmQuizAnswer result:", res.data);

      alert("解答を確定しました！");
      fetchQuizzes();
    } catch (e) {
      console.error(e);
      alert("解答確定に失敗しました");
    }
  };

  /* --------------------------------------------------
     ★ 回答回数リセット（newAnswerCount のみ 0 にする）
     過去回答（items）は保持
  -------------------------------------------------- */
  const resetAnswerCount = async (id: string) => {
    if (!confirm("回答回数をリセットしますか？\n過去回答は保持されます。")) return;

    await updateDoc(doc(db, "quizzes", id), {
      newAnswerCount: 0,
    });

    alert("回答回数をリセットしました！");
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
              flexWrap: "wrap",
            }}
          >
            <img
              src={q.thumbnail}
              alt={q.title}
              style={{ width: 80, height: 80, objectFit: "cover" }}
            />

            <div style={{ flex: 1, minWidth: 200 }}>
              <h2 style={{ fontSize: 20 }}>{q.title}</h2>
              <p>回答回数：{q.maxAnswers}</p>
              <p>現在の回答数：{q.newAnswerCount ?? 0}</p>
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

            {/* ★ 解答確定 */}
            <button
              onClick={() => confirmQuiz(q.id)}
              style={{
                padding: "8px 12px",
                background: "#2563eb",
                color: "white",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
              }}
            >
              解答確定
            </button>

            {/* ★ 回答回数リセット（新規追加） */}
            <button
              onClick={() => resetAnswerCount(q.id)}
              style={{
                padding: "8px 12px",
                background: "#f59e0b",
                color: "white",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
              }}
            >
              回答回数リセット
            </button>

            {/* 削除 */}
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
