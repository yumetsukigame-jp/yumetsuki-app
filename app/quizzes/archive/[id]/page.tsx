import { db } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import AnswersClient from "./AnswersClient";

export default async function ArchiveDetailPage({ params }) {
  const { id: quizId } = await params; // ★ 修正ポイント

  const ref = doc(db, "quizzes_archive", quizId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return <div style={{ padding: 20 }}>このアーカイブは存在しません</div>;
  }

  const quiz = { id: quizId, ...snap.data() };

  return (
    <div style={{ padding: 20, maxWidth: 700, margin: "0 auto" }}>
      <h1>{quiz.title}</h1>

      <img
        src={quiz.thumbnail}
        style={{ width: "100%", borderRadius: 12, marginBottom: 20 }}
      />

      <h2>問題</h2>
      <p>{quiz.question}</p>

      <h3 style={{ marginTop: 20 }}>正解：{quiz.answer}</h3>

      {quiz.explanation && (
        <p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
          {quiz.explanation}
        </p>
      )}

      <div
        style={{
          marginTop: 16,
          padding: 12,
          background: "#f3f4f6",
          borderRadius: 8,
        }}
      >
        <h4>改ざん防止情報</h4>
        <p><strong>salt：</strong>{quiz.salt}</p>
        <p><strong>thread：</strong>{quiz.thread}</p>
      </div>

      <AnswersClient quizId={quizId} correctAnswer={quiz.answer} />
    </div>
  );
}
