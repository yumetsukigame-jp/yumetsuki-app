"use client";

import React, { useEffect, useState } from "react";
import { db, auth } from "@/firebase";
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";

export default function QuizDetailPage({ params }) {
  const { id: quizId } = React.use(params);

  const [uid, setUid] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [quiz, setQuiz] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [myAnswers, setMyAnswers] = useState<any[]>([]); // ★ 過去回答（履歴）
  const [newAnswer, setNewAnswer] = useState(""); // ★ 新規回答入力欄

  const [answers, setAnswers] = useState<any[]>([]);
  const [answersLoading, setAnswersLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  /* --------------------------------------------------
     Auth 初期化
  -------------------------------------------------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  /* --------------------------------------------------
     クイズ読み込み
  -------------------------------------------------- */
  useEffect(() => {
    if (!authReady) return;

    const load = async () => {
      const ref = doc(db, "quizzes", quizId);
      const snap = await getDoc(ref);

      if (!snap.exists) {
        setQuiz(null);
        setLoading(false);
        return;
      }

      const data = snap.data();
      setQuiz(data);

      // ★ 自分の過去回答（items）を取得
      if (uid) {
        const itemsSnap = await getDocs(
          collection(db, "quizzes", quizId, "answers", uid, "items")
        );

        const list = itemsSnap.docs.map((d) => d.data());
        setMyAnswers(list);
      }

      setLoading(false);
    };

    load();
  }, [authReady, uid, quizId]);

  /* --------------------------------------------------
     新規回答送信（複数回答対応）
  -------------------------------------------------- */
  const submitAnswer = async () => {
    if (!newAnswer.trim()) {
      alert("回答を入力してください");
      return;
    }

    // ★ 新規回答を items に追加
    await addDoc(
      collection(db, "quizzes", quizId, "answers", uid!, "items"),
      {
        answer: newAnswer,
        createdAt: new Date(),
      }
    );

    // ★ newAnswerCount を増やす（今回のラウンドの回答数）
    await updateDoc(doc(db, "quizzes", quizId), {
      newAnswerCount: quiz.newAnswerCount + 1,
    });

    // ★ ローカル状態の quiz も更新（回答欄が消える）
    setQuiz({
      ...quiz,
      newAnswerCount: quiz.newAnswerCount + 1,
    });

    // ★ ローカルの過去回答も更新
    setMyAnswers([...myAnswers, { answer: newAnswer, createdAt: new Date() }]);

    setNewAnswer("");

    alert("回答しました！");
  };

  /* --------------------------------------------------
     回答一覧読み込み（全ユーザー）
  -------------------------------------------------- */
  const loadAnswers = async () => {
    setAnswersLoading(true);

    const usersSnap = await getDocs(
      collection(db, "quizzes", quizId, "answers")
    );

    const allAnswers: any[] = [];

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;

      const itemsSnap = await getDocs(
        collection(db, "quizzes", quizId, "answers", userId, "items")
      );

      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);

      const userData = userSnap.exists()
        ? userSnap.data()
        : { displayName: "名無し", xAccount: "未登録" };

      itemsSnap.forEach((item) => {
        allAnswers.push({
          uid: userId,
          answer: item.data().answer,
          createdAt: item.data().createdAt,
          userNickname: userData.displayName ?? "名無し",
          userX: userData.xAccount ?? "未登録",
        });
      });
    }

    setAnswers(allAnswers);
    setAnswersLoading(false);
  };

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);

    if (next && answers.length === 0) {
      loadAnswers();
    }
  };

  /* --------------------------------------------------
     ローディング
  -------------------------------------------------- */
  if (!authReady || loading) {
    return <p style={{ padding: 20 }}>読み込み中…</p>;
  }

  /* --------------------------------------------------
     終了済み
  -------------------------------------------------- */
  if (!quiz) {
    return (
      <div style={{ padding: 20 }}>
        <h2>このクイズは終了しました</h2>
        <p>結果は完了済みクイズ一覧から確認できます。</p>

        <Link
          href="/quizzes/archive"
          style={{
            display: "inline-block",
            marginTop: 20,
            padding: "8px 12px",
            background: "#4f46e5",
            color: "white",
            borderRadius: 8,
            textDecoration: "none",
          }}
        >
          完了済みクイズを見る
        </Link>
      </div>
    );
  }

  /* --------------------------------------------------
     UI
  -------------------------------------------------- */
  return (
    <div style={{ padding: 20, maxWidth: 700, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>{quiz.title}</h1>

      <img
        src={quiz.thumbnail}
        style={{ width: "100%", borderRadius: 12, marginBottom: 20 }}
      />

      <h2 style={{ fontSize: 20, marginBottom: 10 }}>問題</h2>
      <p style={{ marginBottom: 20 }}>{quiz.question}</p>

      {/* ▼ 山分けポイント */}
      <div
        style={{
          padding: 12,
          background: "#eef2ff",
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <strong>このクイズの山分けポイント：</strong>
        {quiz.rewardPoint} pt
      </div>

      {/* ▼ 自分の過去回答（履歴） */}
      {myAnswers.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3>あなたの過去の回答</h3>
          {myAnswers.map((a, i) => (
            <p key={i}>・{a.answer}</p>
          ))}
        </div>
      )}

      {/* ▼ 新規回答フォーム（newAnswerCount で判定） */}
      {quiz.newAnswerCount < quiz.maxAnswers && (
        <div>
          <input
            type="text"
            placeholder="新しい回答"
            value={newAnswer}
            onChange={(e) => setNewAnswer(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 8,
              border: "1px solid #ccc",
              marginBottom: 12,
            }}
          />

          <button
            onClick={submitAnswer}
            style={{
              padding: "12px",
              background: "#4f46e5",
              color: "white",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
            }}
          >
            回答する
          </button>
        </div>
      )}

      {/* ▼ 他人の回答一覧（自分が回答可能な状態では非表示） */}
      {quiz.newAnswerCount >= quiz.maxAnswers && (
        <>
          <button
            onClick={toggleOpen}
            style={{
              marginTop: 20,
              padding: "8px 12px",
              background: "#2563eb",
              color: "white",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
            }}
          >
            {open ? "回答一覧を閉じる" : "他の人の回答を見る"}
          </button>

          {open && (
            <div style={{ marginTop: 16 }}>
              {answersLoading && <p>読み込み中…</p>}

              {!answersLoading && (
                <div>
                  <p>回答数：{answers.length}件</p>

                  {answers.map((a, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px 12px",
                        borderBottom: "1px solid #eee",
                      }}
                    >
                      <strong>
                        {a.userNickname}（{a.userX}）
                      </strong>
                      ：{a.answer}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ▼ アーカイブ後の正解表示 */}
      {quiz.archived && quiz.answer && (
        <div style={{ marginTop: 20 }}>
          <h3>正解：{quiz.answer}</h3>
          {quiz.explanation && (
            <p style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
              {quiz.explanation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
