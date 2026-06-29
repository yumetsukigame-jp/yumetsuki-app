"use client";

import { useEffect, useState } from "react";
import { db, functions } from "@/firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import Link from "next/link";
import { httpsCallable } from "firebase/functions";

export default function AdminQuizListPage() {
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ★ アーカイブ一覧
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveQuizzes, setArchiveQuizzes] = useState<any[]>([]);

  /* --------------------------------------------------
     本番クイズ読み込み
  -------------------------------------------------- */
  const fetchQuizzes = async () => {
    const snap = await getDocs(collection(db, "quizzes"));
    const list = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        round: data.round ?? 0,
      };
    });
    setQuizzes(list);
    setLoading(false);
  };

  useEffect(() => {
    fetchQuizzes();
  }, []);

  /* --------------------------------------------------
     ★ アーカイブ読み込み（ボタン押した時だけ）
  -------------------------------------------------- */
  const fetchArchive = async () => {
    setArchiveLoading(true);

    const snap = await getDocs(collection(db, "quizzes_archive"));
    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    setArchiveQuizzes(list);
    setArchiveLoading(false);
  };

  const toggleArchive = () => {
    const next = !archiveOpen;
    setArchiveOpen(next);

    if (next && archiveQuizzes.length === 0) {
      fetchArchive();
    }
  };

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
     ★ ラウンドを進める
  -------------------------------------------------- */
  const nextRound = async (id: string, currentRound: number) => {
    if (!confirm(`ラウンドを進めますか？\n現在: ${currentRound} → 次: ${currentRound + 1}`))
      return;

    await updateDoc(doc(db, "quizzes", id), {
      round: currentRound + 1,
      newAnswerCount: 0,
    });

    alert("新しいラウンドを開始しました！");
    fetchQuizzes();
  };

  /* --------------------------------------------------
     ★ 本番クイズ削除
  -------------------------------------------------- */
  const deleteQuiz = async (id: string) => {
    if (!confirm("このクイズを完全に削除しますか？\n回答データも消えます。")) return;

    const answersSnap = await getDocs(collection(db, "quizzes", id, "answers"));
    for (const a of answersSnap.docs) {
      await deleteDoc(a.ref);
    }

    await deleteDoc(doc(db, "quizzes", id));

    alert("削除しました");
    fetchQuizzes();
  };

  /* --------------------------------------------------
     ★ アーカイブ削除
  -------------------------------------------------- */
  const deleteArchiveQuiz = async (id: string) => {
    if (!confirm("アーカイブから完全に削除しますか？")) return;

    const answersSnap = await getDocs(
      collection(db, "quizzes_archive", id, "answers")
    );

    for (const a of answersSnap.docs) {
      await deleteDoc(a.ref);
    }

    await deleteDoc(doc(db, "quizzes_archive", id));

    alert("アーカイブを削除しました");

    // 再読み込み
    fetchArchive();
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

      {/* --------------------------------------------------
         本番クイズ一覧
      -------------------------------------------------- */}
      <h2 style={{ marginTop: 20 }}>現在のクイズ</h2>

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
              <p>ラウンド：{q.round}</p>
              <p>回答可能数：{q.maxAnswers}</p>
              <p>現在ラウンドの回答数：{q.newAnswerCount ?? 0}</p>
            </div>

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

            <button
              onClick={() => nextRound(q.id, q.round)}
              style={{
                padding: "8px 12px",
                background: "#7c3aed",
                color: "white",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
              }}
            >
              ラウンドを進める
            </button>

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

      {/* --------------------------------------------------
         アーカイブ一覧（折りたたみ）
      -------------------------------------------------- */}
      <h2 style={{ marginTop: 40 }}>完了済みクイズ（アーカイブ）</h2>

      <button
        onClick={toggleArchive}
        style={{
          padding: "10px 16px",
          background: "#374151",
          color: "white",
          borderRadius: 8,
          border: "none",
          cursor: "pointer",
          marginBottom: 16,
        }}
      >
        {archiveOpen ? "アーカイブを閉じる" : "アーカイブを開く"}
      </button>

      {archiveOpen && (
        <div style={{ marginTop: 10 }}>
          {archiveLoading && <p>読み込み中…</p>}

          {!archiveLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {archiveQuizzes.map((q) => (
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
                    <p>ポイント：{q.rewardPoint}</p>
                    <p>正解：{q.answer}</p>
                    <p>アーカイブ日時：{q.archivedAt?.toDate?.().toLocaleString?.()}</p>
                  </div>

                  <button
                    onClick={() => deleteArchiveQuiz(q.id)}
                    style={{
                      padding: "8px 12px",
                      background: "#ef4444",
                      color: "white",
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    アーカイブ削除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
