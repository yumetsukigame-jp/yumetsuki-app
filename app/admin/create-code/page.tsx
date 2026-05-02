"use client";

import { useState } from "react";
import { db } from "@/firebase";
import { doc, setDoc } from "firebase/firestore";

export default function CreateCodePage() {
  const [code, setCode] = useState("");
  const [points, setPoints] = useState(10);
  const [type, setType] = useState("global"); // ★ 追加
  const [message, setMessage] = useState("");

  const handleCreate = async () => {
    if (!code) {
      setMessage("コードを入力してください");
      return;
    }

    try {
      const codeRef = doc(db, "validCodes", code);

      await setDoc(codeRef, {
        points: Number(points),
        type: type, // ★ 追加
        createdAt: new Date(),
      });

      setMessage("コードを発行しました！");
      setCode("");

    } catch (error) {
      console.error(error);
      setMessage("エラーが発生しました");
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1>新しいコードを発行</h1>

      <label>コード</label>
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="コードを入力"
        style={{ width: "100%", padding: "10px", marginBottom: "10px" }}
      />

      <label>付与ポイント</label>
      <input
        type="number"
        value={points}
        onChange={(e) => setPoints(e.target.value)}
        placeholder="付与ポイント"
        style={{ width: "100%", padding: "10px", marginBottom: "10px" }}
      />

      <label>タイプ</label>
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        style={{
          width: "100%",
          padding: "10px",
          marginBottom: "20px",
          borderRadius: "6px",
        }}
      >
        <option value="global">全員で1回だけ使える</option>
        <option value="perUser">全員が1回ずつ使える</option>
      </select>

      <button
        onClick={handleCreate}
        style={{
          width: "100%",
          padding: "12px",
          background: "#4f46e5",
          color: "white",
          borderRadius: "8px",
          fontSize: "16px",
        }}
      >
        発行する
      </button>

      {message && <p style={{ marginTop: "10px" }}>{message}</p>}
    </div>
  );
}
