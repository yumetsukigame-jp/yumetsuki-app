"use client";

import type { DocumentData } from "firebase/firestore";

import React, { useEffect, useState } from "react";
import { db, auth, functions } from "@/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import LoadingState from "@/app/components/LoadingState";
import { withRetry } from "@/app/lib/retry";
import { formatQuizDeadline } from "@/app/lib/quizDeadline";

type QuizDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default function QuizDetailPage({ params }: QuizDetailPageProps) {
  const { id: quizId } = React.use(params);

  const [uid, setUid] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [quiz, setQuiz] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);

  const [myAnswers, setMyAnswers] = useState<DocumentData[]>([]);
  const [myCurrentRoundAnswers, setMyCurrentRoundAnswers] = useState<DocumentData[]>([]);
  const [newAnswer, setNewAnswer] = useState("");

  const [answers, setAnswers] = useState<DocumentData[]>([]);
  const [answersLoading, setAnswersLoading] = useState(false);

  const [open, setOpen] = useState(false);

  // ★ 追加：送信ロック
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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
      try {
        const snap = await withRetry(
          () => getDoc(doc(db, "quizzes", quizId)),
          2,
          500,
          10000
        );

        if (!snap.exists()) {
          setQuiz(null);
          return;
        }

        const data = snap.data();
        data.round = data.round ?? 0;
        setQuiz(data);

        if (uid) {
          const itemsSnap = await withRetry(
            () =>
              getDocs(collection(db, "quizzes", quizId, "answers", uid, "items")),
            2,
            500,
            10000
          );
          const allMyAnswers = itemsSnap.docs.map((d) => d.data());
          setMyAnswers(allMyAnswers.filter((a) => (a.round ?? 0) <= data.round));
          setMyCurrentRoundAnswers(
            allMyAnswers.filter((a) => (a.round ?? 0) === data.round)
          );
        }
      } catch (error) {
        console.error("クイズ詳細の読み込みに失敗しました", error);
        setQuiz(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [authReady, uid, quizId]);

  /* --------------------------------------------------
     新規回答送信（answers/{uid} にユーザー情報を書き込む）
  -------------------------------------------------- */
  const submitAnswer = async () => {
    if (isSubmitting || !quiz || !uid) return;
    setIsSubmitting(true);

    try {
      const answer = newAnswer.trim();
      if (!answer) {
        alert("回答を入力してください");
        return;
      }

      const submit = httpsCallable<
        { quizId: string; answer: string },
        { round: number; newAnswerCount: number; createdAt: number }
      >(functions, "submitQuizAnswer");
      const { data } = await submit({ quizId, answer });

      const newItem = {
        answer,
        createdAt: new Date(data.createdAt),
        round: data.round,
      };

      setMyAnswers([...myAnswers, newItem]);
      setMyCurrentRoundAnswers([...myCurrentRoundAnswers, newItem]);

      setQuiz({
        ...quiz,
        newAnswerCount: data.newAnswerCount,
      });

      setNewAnswer("");

      alert("回答しました！");
    } catch (error: unknown) {
      console.error("回答の送信に失敗しました", error);
      alert(
        error instanceof Error
          ? error.message
          : "回答の送信に失敗しました"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /* --------------------------------------------------
     回答一覧読み込み
  -------------------------------------------------- */
  const loadAnswers = async () => {
    const currentQuiz = quiz;
    if (!currentQuiz) return;

    setAnswersLoading(true);
    try {
      const usersSnap = await withRetry(
        () => getDocs(collection(db, "quizzes", quizId, "answers")),
        2,
        500,
        10000
      );
      const allAnswers: DocumentData[] = [];

      for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;
        const [itemsSnap, userSnap] = await Promise.all([
          withRetry(
            () =>
              getDocs(collection(db, "quizzes", quizId, "answers", userId, "items")),
            2,
            500,
            10000
          ),
          withRetry(() => getDoc(doc(db, "users", userId)), 2, 500, 10000),
        ]);
        const userData = userSnap.exists()
          ? userSnap.data()
          : { displayName: "名無し", xAccount: "未登録" };

        itemsSnap.forEach((item) => {
          const itemData = item.data();
          if ((itemData.round ?? 0) <= (currentQuiz.round ?? 0)) {
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
    } catch (error) {
      console.error("クイズ回答一覧の読み込みに失敗しました", error);
      setAnswers([]);
    } finally {
      setAnswersLoading(false);
    }
  };

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);

    if (next && answers.length === 0) {
      loadAnswers();
    }
  };

  if (!authReady || loading) {
    return <LoadingState />;
  }

  if (!quiz) {
    return (
      <div style={{ padding: 20 }}>
        <h2>このクイズは終了しました</h2>
        <Link href="/quizzes/archive">完了済みクイズを見る</Link>
      </div>
    );
  }

  const answersClosed = Boolean(
    quiz.archived ||
    quiz.answersClosedAt ||
    quiz.finalizationStatus ||
    (quiz.deadlineAt && quiz.deadlineAt.toMillis() <= now)
  );

  return (
    <div style={{ padding: 20, maxWidth: 700, margin: "0 auto" }}>
      <h1>{quiz.title}</h1>

      <img src={quiz.thumbnail} style={{ width: "100%", borderRadius: 12 }} />

      <h2>問題</h2>
      <p>{quiz.question}</p>
      <p>回答締切：{formatQuizDeadline(quiz.deadlineAt)}</p>
      <p>締切の翌日0:05（日本時間）に結果が確定します。</p>
      {answersClosed && <p role="status">このクイズの回答受付は終了しました。</p>}

      <div style={{ padding: 12, background: "#eef2ff", borderRadius: 8 }}>
        <strong>このクイズの山分けポイント：</strong>
        {quiz.rewardPoint} pt
      </div>

      {myAnswers.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3>あなたの過去の回答</h3>
          {myAnswers.map((a: { answer?: string }, i: number) => (
            <p key={i}>・{a.answer}</p>
          ))}
        </div>
      )}

      {!answersClosed && myCurrentRoundAnswers.length < quiz.maxAnswers && (
        <div>
          <input
            type="text"
            placeholder="新しい回答"
            value={newAnswer}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAnswer(e.target.value)}
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
            disabled={isSubmitting}
            style={{
              padding: "12px",
              background: isSubmitting ? "#9ca3af" : "#4f46e5",
              color: "white",
              borderRadius: 8,
              border: "none",
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "送信中…" : "回答する"}
          </button>
        </div>
      )}

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

                  {answers.map((a: { userNickname?: string; userX?: string; answer?: string }, i: number) => (
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
