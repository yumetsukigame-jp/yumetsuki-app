"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";

export default function AnswersClient({ quizId, correctAnswer }) {
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const usersSnap = await getDocs(
        collection(db, "quizzes_archive", quizId, "answers")
      );

      const all = [];

      for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;

        const itemsSnap = await getDocs(
          collection(
            db,
            "quizzes_archive",
            quizId,
            "answers",
            userId,
            "items"
          )
        );

        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);

        const userData = userSnap.exists()
          ? userSnap.data()
          : { displayName: "名無し", xAccount: "未登録" };

        itemsSnap.forEach((item) => {
          const d = item.data();
          all.push({
            uid: userId,
            answer: d.answer,
            round: d.round ?? 0,
            createdAt: d.createdAt?.toDate?.() ?? null,
            userNickname: userData.displayName,
            userX: userData.xAccount,
          });
        });
      }

      setAnswers(all);
      setLoading(false);
    };

    load();
  }, [quizId]);

  if (loading) return <p>回答読み込み中…</p>;

  return (
    <div style={{ marginTop: 24 }}>
      <h2>回答一覧</h2>

      <p>回答数：{answers.length}件</p>

      {answers.map((a, i) => {
        const isCorrect = a.answer === correctAnswer;

        return (
          <div
            key={i}
            style={{
              padding: 8,
              borderBottom: "1px solid #eee",
              borderRadius: 6,
              background: isCorrect ? "#fef3c7" : "transparent", // ★ 正解背景色
              marginBottom: 6,
            }}
          >
            <strong>
              {a.userNickname}（{a.userX}）
            </strong>
            ：{a.answer}
            {isCorrect && " ★正解"}
          </div>
        );
      })}
    </div>
  );
}
