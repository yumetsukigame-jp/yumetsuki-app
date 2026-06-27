"use client";

import { useState, useEffect } from "react";
import { db } from "@/firebase";
import { collection, getDocs, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";

/* --------------------------------------------------
   ランダム英数字生成
-------------------------------------------------- */
function randomString(len = 8) {
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

/* --------------------------------------------------
   タイトルからID生成（必ず10文字以上）
-------------------------------------------------- */
function generateIdFromTitle(title: string) {
  let base = title
    .normalize("NFKD")
    .replace(/[^\w]/g, "")
    .toLowerCase();

  if (!base || base.length === 0) {
    return randomString(10);
  }

  const suffix = randomString(6);
  let id = `${base}-${suffix}`;

  if (id.length < 10) {
    id = id + randomString(10 - id.length);
  }

  return id;
}

export default function AddQuizForm() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [images, setImages] = useState<any[]>([]);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [explanation, setExplanation] = useState("");
  const [rewardPoint, setRewardPoint] = useState<number | "">(1000);
  const [maxAnswers, setMaxAnswers] = useState<number | "">(1);

  /* --------------------------------------------------
     Firestore から画像一覧を取得
  -------------------------------------------------- */
  useEffect(() => {
    const load = async () => {
      const snap = await getDocs(collection(db, "imageMeta"));
      const list = snap.docs
        .map((d) => d.data())
        .filter((d) => d.folder === "quiz");

      setImages(list);
    };

    load();
  }, []);

  /* --------------------------------------------------
     保存処理
  -------------------------------------------------- */
  const handleSave = async (e: any) => {
    e.preventDefault();

    if (!title.trim() || !thumbnail || !question.trim()) {
      alert("タイトル・サムネイル・問題文は必須です");
      return;
    }

    const id = generateIdFromTitle(title);

    // ★ 正解の改ざん防止：salt + thread 生成
    const salt = randomString(12);
    const thread = await sha256(`${answer}-${salt}`);

    await setDoc(doc(db, "quizzes", id), {
      title,
      thumbnail,
      question,
      answer,
      explanation,
      rewardPoint: Number(rewardPoint),
      maxAnswers: Number(maxAnswers),
      salt,
      thread,
      archived: false,
      newAnswerCount: 0,   // ★ 新規回答数の初期化（今回の仕様で追加）
      createdAt: serverTimestamp(),
    });

    alert("クイズを作成しました！");
    router.push("/admin/quizzes");
  };

  return (
    <div style={{ padding: 20, maxWidth: 700, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>クイズ作成</h1>

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

          {thumbnail && (
            <p style={{ marginTop: 8 }}>
              選択中：<strong>{thumbnail}</strong>
            </p>
          )}
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
          <label>正解（後から編集可）</label>
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* 説明（解説） */}
        <div>
          <label>説明（正解確定後にユーザーへ表示されます）</label>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            style={{ ...inputStyle, height: 120 }}
          />
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
          <label>回答回数（1人あたり）</label>
          <input
            type="number"
            value={maxAnswers}
            onChange={(e) =>
              setMaxAnswers(e.target.value === "" ? "" : Number(e.target.value))
            }
            style={inputStyle}
          />
        </div>

        {/* 作成ボタン */}
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
          作成する
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ccc",
};
