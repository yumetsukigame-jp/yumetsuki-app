"use client";

import React, { useEffect, useState } from "react";
import { db, auth } from "@/firebase";
import {
  doc,
  getDoc,
  addDoc,
  setDoc,
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

  const [myAnswers, setMyAnswers] = useState<any[]>([]);
  const [myCurrentRoundAnswers, setMyCurrentRoundAnswers] = useState<any[]>([]);
  const [newAnswer, setNewAnswer] = useState("");

  const [answers, setAnswers] = useState<any[]>([]);
  const [answersLoading, setAnswersLoading] = useState(false);

  const [open, setOpen] = useState(false);

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

      if (!snap.exists()) {
        setQuiz(null);
        setLoading(false);
        return;
      }

      const data = snap.data();

      // ★ round が無い既存クイズは 0 として扱う
      data.round = data.round ?? 0;

      setQuiz(data);

      // ★ 自分の過去回答（round <= quiz.round）
      if (uid) {
        const itemsSnap = await getDocs(
          collection(db, "quizzes", quizId, "answers", uid, "items")
        );

        const allMyAnswers = itemsSnap.docs.map((d) => d.data());

        const visibleAnswers = allMyAnswers.filter(
          (a) => (a.round ?? 0) <= data.round
        );

        const currentRoundAnswers = allMyAnswers.filter(
          (a) => (a.round ?? 0) === data.round
        );

        setMyAnswers(visibleAnswers);
        setMyCurrentRoundAnswers(currentRoundAnswers);
      }

      setLoading(false);
    };

    load();
  }, [authReady, uid, quizId]);

  /* --------------------------------------------------
     新規回答送信（answers/{uid} を必ず作る）
  -------------------------------------------------- */
  const submitAnswer = async () => {
    if (!newAnswer.trim()) {
      alert("回答を入力してください");
      return;
    }

    // ★ answers/{uid} を必ず作成（これが今回の修正点）
    await setDoc(
      doc(db, "quizzes", quizId, "answers", uid!),
      {},
      { merge: true }
    );

    // ★ items に回答を追加
    await addDoc(
      collection(db, "quizzes", quizId, "answers", uid!, "items"),
      {
        answer: newAnswer,
        createdAt: new Date(),
        round: quiz.round ?? 0,
      }
    );

    await updateDoc(doc(db, "quizzes", quizId), {
      newAnswerCount: quiz.newAnswerCount + 1,
    });

    const newItem = {
      answer: newAnswer,
      createdAt: new Date(),
      round: quiz.round ?? 0,
    };

    setMyAnswers([...myAnswers, newItem]);
    setMyCurrentRoundAnswers([...myCurrentRoundAnswers, newItem]);

    setQuiz({
      ...quiz,
      newAnswerCount: quiz.newAnswerCount + 1,
    });

    setNewAnswer("");

    alert("回答しました！");
  };

  /* --------------------------------------------------
     回答一覧読み込み
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
        const itemData = item.data();
        const itemRound = itemData.round ?? 0;

        // ★ round <= quiz.round の回答だけ表示
        if (itemRound <= (quiz.round ?? 0)) {
          allAnswers.push({
            uid: userId,
            answer: itemData.answer,
            createdAt: itemData.createdAt,
            userNickname: userData.displayName ?? "名無し",
            userX: userData.xAccount ?? "未登録",
          });
        }
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
        <Link href="/quizzes/archive">完了済みクイズを見る</Link>
      </div>
    );
  }

  /* --------------------------------------------------
     UI
  -------------------------------------------------- */
  return (
    <div style={{ padding: 20, maxWidth: 700, margin: "0 auto" }}>
      <h1>{quiz.title}</h1>

      <img src={quiz.thumbnail} style={{ width: "100%", borderRadius: 12 }} />

      <h2>問題</h2>
      <p>{quiz.question}</p>

      <div style={{ padding: 12, background: "#eef2ff", borderRadius: 8 }}>
        <strong>このクイズの山分けポイント：</strong>
        {quiz.rewardPoint} pt
      </div>

      {/* ▼ 自分の過去回答（round <= quiz.round） */}
      {myAnswers.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3>あなたの過去の回答</h3>
          {myAnswers.map((a, i) => (
            <p key={i}>・{a.answer}</p>
          ))}
        </div>
      )}

      {/* ▼ 新規回答フォーム（現在ラウンドの回答数で判定） */}
      {myCurrentRoundAnswers.length < quiz.maxAnswers && (
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

      {/* ▼ 他人の回答一覧（現在ラウンドの回答が maxAnswers に達したら） */}
      {myCurrentRoundAnswers.length >= quiz.maxAnswers && (
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
              {answersLoading && <p>読み込み中です…</p>}

              {!answersLoading && (
                <div>
                  <p>回答数：{answers.length}件</p>

                  {answers.map((a, i) => (
                    <div key={i} style={{ padding: "8px 12px" }}>
                      <strong>{a.userNickname}（{a.userX}）</strong>
                      ：{a.answer}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
