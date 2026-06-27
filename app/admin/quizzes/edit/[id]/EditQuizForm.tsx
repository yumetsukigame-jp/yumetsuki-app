"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
} from "firebase/firestore";
import { useRouter } from "next/navigation";

/* --------------------------------------------------
   ランダム英数字生成
-------------------------------------------------- */
function randomString(len = 12) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

/* --------------------------------------------------
   SHA-256 ハッシュ生成
-------------------------------------------------- */
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function EditQuizForm({ quizId }: { quizId: string }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [images, setImages] = useState<any[]>([]);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [explanation, setExplanation] = useState("");

  const [rewardPoint, setRewardPoint] = useState<number | "">(1000);
  const [maxAnswers, setMaxAnswers] = useState<number | "">(1);

  const [salt, setSalt] = useState("");
  const [thread, setThread] = useState("");

  const [originalAnswer, setOriginalAnswer] = useState("");

  /* --------------------------------------------------
     クイズ読み込み
  -------------------------------------------------- */
  useEffect(() => {
    const load = async () => {
      const ref = doc(db, "quizzes", quizId);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        alert("クイズが存在しません");
        router.push("/admin/quizzes");
        return;
      }

      const data = snap.data();

      setTitle(data.title);
      setThumbnail(data.thumbnail);
      setQuestion(data.question);
      setAnswer(data.answer ?? "");
      setExplanation(data.explanation ?? "");
      setRewardPoint(data.rewardPoint);
      setMaxAnswers(data.maxAnswers);

      setSalt(data.salt ?? "");
      setThread(data.thread ?? "");

      setOriginalAnswer(data.answer ?? "");

      // 画像一覧
      const imgSnap = await getDocs(collection(db, "imageMeta"));
      const list = imgSnap.docs
        .map((d) => d.data())
        .filter((d) => d.folder === "quiz");

      setImages(list);

      setLoading(false);
    };

    load();
  }, [quizId, router]);

  /* --------------------------------------------------
     保存処理
  -------------------------------------------------- */
  const handleSave = async (e: any) => {
    e.preventDefault();

    let newSalt = salt;
    let newThread = thread;

    // ★ 正解が変更された場合のみ再生成
    if (answer !== originalAnswer) {
      newSalt = randomString(12);
      newThread = await sha256(`${answer}-${newSalt}`);
    }

    await updateDoc(doc(db, "quizzes", quizId), {
      title,
      thumbnail,
      question,
      answer,
      explanation,
      rewardPoint: Number(rewardPoint),
      maxAnswers: Number(maxAnswers),
      salt: newSalt,
      thread: newThread,
    });

    alert("更新しました！");
    router.push("/admin/quizzes");
  };

  /* --------------------------------------------------
     ★ 回答回数だけリセット（回答は消さない）
  -------------------------------------------------- */
  const resetAnswers = async () => {
    if (!confirm("回答回数をリセットしますか？")) return;

    await updateDoc(doc(db, "quizzes", quizId), {
      answerCount: 0,
    });

    alert("回答回数をリセットしました");
  };

  /* --------------------------------------------------
     アーカイブ移動
  -------------------------------------------------- */
  const archiveQuiz = async () => {
    if (!confirm("このクイズをアーカイブしますか？")) return;

    await updateDoc(doc(db, "quizzes", quizId), {
      archived: true,
    });

    alert("アーカイブしました");
    router.push("/admin/quizzes");
  };

  if (loading) return <p style={{ padding: 20 }}>読み込み中…</p>;

  return (
    <div style={{ padding: 20, maxWidth: 700, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>クイズ編集</h1>

      <form
        onSubmit={handleSave}
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        {/* タイトル */}
        <div>
          <label>タイトル</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* サムネイル */}
        <div>
          <label>サムネイル画像</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            {images.map((img) => (
              <div
                key={img.url}
                onClick={() => setThumbnail(img.url)}
                style={{
                  border: thumbnail === img.url ? "3px solid #4f46e5" : "1px solid #ccc",
                  padding: 5,
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                <img
                  src={img.url}
                  alt={img.prefix}
                  width={100}
                  style={{ borderRadius: 6 }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* 問題文 */}
        <div>
          <label>問題文</label>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            style={{ ...inputStyle, height: 120 }}
          />
        </div>

        {/* 正解 */}
        <div>
          <label>正解</label>
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* 解説 */}
        <div>
          <label>解説</label>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            style={{ ...inputStyle, height: 120 }}
          />
        </div>

        {/* salt と thread */}
        <div>
          <label>スレッド値（改ざん防止用）</label>
          <p>salt：{salt}</p>
          <p>thread（SHA-256）：{thread}</p>
        </div>

        {/* 山分けポイント */}
        <div>
          <label>山分けポイント</label>
          <input
            type="number"
            value={rewardPoint}
            onChange={(e) =>
              setRewardPoint(e.target.value === "" ? "" : Number(e.target.value))
            }
            style={inputStyle}
          />
        </div>

        {/* 回答回数 */}
        <div>
          <label>回答回数</label>
          <input
            type="number"
            value={maxAnswers}
            onChange={(e) =>
              setMaxAnswers(e.target.value === "" ? "" : Number(e.target.value))
            }
            style={inputStyle}
          />
        </div>

        <button
          type="submit"
          style={{
            padding: "12px",
            background: "#4f46e5",
            color: "white",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
          }}
        >
          保存する
        </button>
      </form>

      <button
        onClick={resetAnswers}
        style={{
          marginTop: 20,
          padding: "10px 16px",
          background: "#f59e0b",
          color: "white",
          borderRadius: 8,
          border: "none",
          cursor: "pointer",
        }}
      >
        回答回数をリセット
      </button>

      <button
        onClick={archiveQuiz}
        style={{
          marginTop: 10,
          padding: "10px 16px",
          background: "#ef4444",
          color: "white",
          borderRadius: 8,
          border: "none",
          cursor: "pointer",
        }}
      >
        アーカイブへ移動
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ccc",
};
