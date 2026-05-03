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

      if (!user) {
        router.push("/login");
        return;
      }

      const uid = user.uid;

      // ★ ユーザー情報取得（Xアカウントチェック）
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        setMessage("ユーザー情報が見つかりません");
        return;
      }

      const userData = userSnap.data();

      // ★ Xアカウント未登録なら警告
      if (!userData.xAccount || userData.xAccount.trim() === "") {
        setMessage(
          "Xアカウントが未登録です。プロフィール画面から登録してください。"
        );
        return;
      }

      // validCodes からポイントとタイプを取得
      const codeRef = doc(db, "validCodes", code);
      const codeSnap = await getDoc(codeRef);

      if (!codeSnap.exists()) {
        setMessage("無効なコードです");
        return;
      }

      const { points, type } = codeSnap.data();

      // 使用済みコードチェック
      let usedKey = type === "global" ? code : `${uid}_${code}`;

      const usedRef = doc(db, "usedCodes", usedKey);
      const usedSnap = await getDoc(usedRef);

      if (usedSnap.exists()) {
        setMessage("このコードはすでに使用されています");
        return;
      }

      // ポイント更新
      const currentPoints = userData.points ?? 0;

      await setDoc(
        userRef,
        {
          points: currentPoints + points,
        },
        { merge: true }
      );

      // 使用済み登録
      await setDoc(usedRef, {
        usedAt: new Date(),
        userId: uid,
        type: type,
      });

      // 履歴保存
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

      {message && (
        <p style={{ marginTop: "10px", color: "red", fontWeight: "bold" }}>
          {message}
        </p>
      )}

      {/* Xアカウント未登録時の誘導 */}
      {message.includes("Xアカウントが未登録") && (
        <button
          onClick={() => router.push("/profile")}
          style={{
            marginTop: "10px",
            width: "100%",
            padding: "12px",
            background: "#2563eb",
            color: "white",
            borderRadius: "8px",
            fontSize: "16px",
          }}
        >
          プロフィールを編集する
        </button>
      )}
    </div>
  );
}
