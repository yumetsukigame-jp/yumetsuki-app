"use client";

import { useState } from "react";
import { db, auth } from "@/firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function CodePage() {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();

  const handleSubmit = async () => {
    try {
      const user = auth.currentUser;

      // ログインしていない場合はログインページへ
      if (!user) {
        router.push("/login");
        return;
      }

      const uid = user.uid;

      // validCodes からポイントとタイプを取得
      const codeRef = doc(db, "validCodes", code);
      const codeSnap = await getDoc(codeRef);

      if (!codeSnap.exists()) {
        setMessage("無効なコードです");
        return;
      }

      const { points, type } = codeSnap.data();

      // -----------------------------
      // ① 使用済みコードチェック
      // -----------------------------
      let usedKey = "";

      if (type === "global") {
        // 全員で1回だけ
        usedKey = code;
      } else if (type === "perUser") {
        // 全員が1回ずつ
        usedKey = `${uid}_${code}`;
      } else {
        setMessage("コードのタイプが不正です");
        return;
      }

      const usedRef = doc(db, "usedCodes", usedKey);
      const usedSnap = await getDoc(usedRef);

      if (usedSnap.exists()) {
        setMessage("このコードはすでに使用されています");
        return;
      }

      // -----------------------------
      // ② ユーザーのポイントを更新
      // -----------------------------
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      const currentPoints = userSnap.exists() ? userSnap.data().points : 0;

      await setDoc(
        userRef,
        {
          points: currentPoints + points,
        },
        { merge: true }
      );

      // -----------------------------
      // ③ 使用済みコードとして登録
      // -----------------------------
      await setDoc(usedRef, {
        usedAt: new Date(),
        userId: uid,
        type: type,
      });

      // -----------------------------
      // ④ 履歴を保存
      // -----------------------------
      await addDoc(collection(db, "pointHistory"), {
        userId: uid,
        code: code,
        added: points,
        createdAt: serverTimestamp(),
      });

      setMessage(`${points} pt を付与しました！`);
    } catch (error) {
      console.error(error);
      setMessage("エラーが発生しました");
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "480px", margin: "0 auto" }}>
      <h1>コード入力でポイント獲得</h1>

      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="コードを入力"
        style={{ width: "100%", padding: "10px", marginBottom: "10px" }}
      />

      <button
        onClick={handleSubmit}
        style={{
          width: "100%",
          padding: "12px",
          background: "#4f46e5",
          color: "white",
          borderRadius: "8px",
          fontSize: "16px",
        }}
      >
        送信
      </button>

      {message && <p style={{ marginTop: "10px" }}>{message}</p>}
    </div>
  );
}
