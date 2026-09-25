"use client";

import { useState } from "react";
import { db } from "@/firebase";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";

type CodeType = "global" | "perUser" | "limited";

export default function CreateCodePage() {
  const [code, setCode] = useState("");
  const [points, setPoints] = useState(10);
  const [type, setType] = useState<CodeType>("global");
  const [maxUses, setMaxUses] = useState(10);
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      setMessage("コードを入力してください");
      return;
    }
    if (!Number.isFinite(points) || points <= 0) {
      setMessage("付与ポイントは1以上で入力してください");
      return;
    }
    if (type === "limited" && (!Number.isInteger(maxUses) || maxUses <= 0)) {
      setMessage("使用可能人数は1人以上で入力してください");
      return;
    }

    setCreating(true);
    try {
      const codeRef = doc(db, "validCodes", normalizedCode);

      await runTransaction(db, async (transaction) => {
        const existingCode = await transaction.get(codeRef);
        if (existingCode.exists()) {
          throw new Error("CODE_ALREADY_EXISTS");
        }

        transaction.set(codeRef, {
          points: Number(points),
          type,
          maxUses: type === "limited" ? maxUses : null,
          usedCount: 0,
          createdAt: serverTimestamp(),
        });
      });

      setMessage("コードを発行しました！");
      setCode("");
    } catch (error) {
      if (error instanceof Error && error.message === "CODE_ALREADY_EXISTS") {
        setMessage("同じコードがすでに存在します");
      } else {
        console.error(error);
        setMessage("エラーが発生しました");
      }
    } finally {
      setCreating(false);
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
        onChange={(e) => setPoints(Number(e.target.value))}
        placeholder="付与ポイント"
        style={{ width: "100%", padding: "10px", marginBottom: "10px" }}
      />

      <label>タイプ</label>
      <select
        value={type}
        onChange={(e) => setType(e.target.value as CodeType)}
        style={{
          width: "100%",
          padding: "10px",
          marginBottom: "20px",
          borderRadius: "6px",
        }}
      >
        <option value="global">全員で1回だけ使える</option>
        <option value="perUser">全員が1回ずつ使える</option>
        <option value="limited">各ユーザー1回・指定人数まで使える</option>
      </select>

      {type === "limited" && (
        <>
          <label>使用可能人数</label>
          <input
            type="number"
            min={1}
            step={1}
            value={maxUses}
            onChange={(e) => setMaxUses(Number(e.target.value))}
            style={{ width: "100%", padding: "10px", marginBottom: "20px" }}
          />
        </>
      )}

      <button
        onClick={() => void handleCreate()}
        disabled={creating}
        style={{
          width: "100%",
          padding: "12px",
          background: creating ? "#999" : "#4f46e5",
          color: "white",
          borderRadius: "8px",
          fontSize: "16px",
        }}
      >
        {creating ? "発行中…" : "発行する"}
      </button>

      {message && <p style={{ marginTop: "10px" }}>{message}</p>}
    </div>
  );
}
