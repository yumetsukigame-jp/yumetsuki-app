"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";

export default function AnswersClient({ quizId }) {
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [debug, setDebug] = useState({ users: 0, items: 0 });

  useEffect(() => {
    const load = async () => {
      console.log("★ quizId:", quizId);

      const usersSnap = await getDocs(
        collection(db, "quizzes_archive", quizId, "answers")
      );

      const userCount = usersSnap.docs.length;
      let itemCount = 0;

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

        itemCount += itemsSnap.docs.length;

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

      setDebug({ users: userCount, items: itemCount });
      setAnswers(all);
      setLoading(false);
    };

    load();
  }, [quizId]);

  if (loading) return <p>回答読み込み中…</p>;

  return (
    <div style={{ marginTop: 24 }}>
      <h2>回答一覧</h2>

      {/* ★ ここが最重要：画面が読んでいる quizId を表示 */}
      <p>quizId: {String(quizId)}</p>

      <p>回答数：{answers.length}件</p>

      <p style={{ fontSize: 12, color: "#666" }}>
        usersSnap: {debug.users} 件 / itemsSnap 合計: {debug.items} 件
      </p>

      {answers.map((a, i) => (
        <div key={i} style={{ padding: 8, borderBottom: "1px solid #eee" }}>
          <strong>{a.userNickname}（{a.userX}）</strong>：{a.answer}
        </div>
      ))}
    </div>
  );
}
