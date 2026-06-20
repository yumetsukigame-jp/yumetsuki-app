"use client";

import React, { useEffect, useState } from "react";
import { db, auth } from "@/firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
} from "firebase/firestore";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";

export default function QuizDetailPage({ params }) {
  const { id: quizId } = React.use(params);

  const [uid, setUid] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [quiz, setQuiz] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [myAnswer, setMyAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [answers, setAnswers] = useState<any[]>([]);
  const [answersLoading, setAnswersLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false); // ★ 山分けポイント＋ハッシュ折りたたみ

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
      setQuiz(data);

      if (uid) {
        const mySnap = await getDoc(
          doc(db, "quizzes", quizId, "answers", uid)
        );
        if (mySnap.exists()) {
          setMyAnswer(mySnap.data().answer);
          setSubmitted(true);
        }
      }

      setLoading(false);
    };

    load();
  }, [authReady, uid, quizId]);

  /* --------------------------------------------------
     回答送信
  -------------------------------------------------- */
  const submitAnswer = async () => {
    if (!myAnswer.trim()) {
      alert("回答を入力してください");
      return;
    }

    await setDoc(doc(db, "quizzes", quizId, "answers", uid!), {
      answer: myAnswer,
      createdAt: new Date(),
    });

    setSubmitted(true);
    alert("回答しました！");
  };

  /* --------------------------------------------------
     回答一覧読み込み（displayName + xAccount）
  -------------------------------------------------- */
  const loadAnswers = async () => {
    setAnswersLoading(true);

    const snap = await getDocs(
      collection(db, "quizzes", quizId, "answers")
    );

    const list: any[] = [];

    for (const d of snap.docs) {
      const uid = d.id;
      const ans = d.data();

      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);

      const userData = userSnap.exists()
        ? userSnap.data()
        : {
            displayName: "名無し",
            xAccount: "未登録",
          };

      list.push({
        uid,
        answer: ans.answer,
        createdAt: ans.createdAt,
        userNickname: userData.displayName ?? "名無し",
        userX: userData.xAccount ?? "未登録",
      });
    }

    setAnswers(list);
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

      {/* ▼ 山分けポイント（参加価値） */}
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

      {/* ▼ 詳細（山分けポイント＋ハッシュ）折りたたみ */}
      <button
        onClick={() => setDetailOpen(!detailOpen)}
        style={{
          padding: "8px 12px",
          background: "#4f46e5",
          color: "white",
          borderRadius: 6,
          border: "none",
          cursor: "pointer",
          marginBottom: 12,
        }}
      >
        {detailOpen ? "詳細を閉じる" : "詳細（山分けポイント・ハッシュ）"}
      </button>

      {detailOpen && (
        <div
          style={{
            padding: 12,
            background: "#f3f4f6",
            borderRadius: 8,
            marginBottom: 20,
          }}
        >
          <p><strong>山分けポイント：</strong>{quiz.rewardPoint} pt</p>

          <h4 style={{ marginTop: 12 }}>改ざん防止ハッシュ（thread）</h4>
          <p style={{ fontSize: 14, wordBreak: "break-all" }}>
            {quiz.thread}
          </p>

          {!quiz.archived && (
            <p style={{ marginTop: 8, fontSize: 13, color: "#555" }}>
              ※ 正解確定前のため salt は非公開です。
            </p>
          )}

          {quiz.archived && (
            <>
              <p><strong>salt：</strong>{quiz.salt}</p>
            </>
          )}
        </div>
      )}

      {/* ▼ 回答前 */}
      {!submitted && (
        <div>
          <input
            type="text"
            placeholder="あなたの回答"
            value={myAnswer}
            onChange={(e) => setMyAnswer(e.target.value)}
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

      {/* ▼ 回答後 */}
      {submitted && (
        <div style={{ marginTop: 20 }}>
          <h3>あなたの回答：{myAnswer}</h3>

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

                  {answers.map((a) => (
                    <div
                      key={a.uid}
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

                  {/* ▼ ハッシュ値の注釈 */}
                  <p style={{ marginTop: 20, fontSize: 13, color: "#555" }}>
                    ※ thread（改ざん防止ハッシュ）は、クイズの正解と salt を組み合わせて  
                    SHA-256 でハッシュ化した値です。  
                    運営側が後から正解を変更していないことを、誰でも確認できます。
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
