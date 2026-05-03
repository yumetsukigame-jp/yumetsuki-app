"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export default function ProfilePage() {
  const [name, setName] = useState("");
  const [xAccount, setXAccount] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        const data = snap.data();
        setName(data.name ?? "");
        setXAccount(data.xAccount ?? "");
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  const save = async () => {
    const user = auth.currentUser;
    if (!user) return;

    await updateDoc(doc(db, "users", user.uid), {
      name,
      xAccount,
    });

    alert("保存しました！");
  };

  if (loading) {
    return <div style={{ padding: 20 }}>読み込み中…</div>;
  }

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "480px",
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      <h1 style={{ marginBottom: "20px" }}>プロフィール編集</h1>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <input
          type="text"
          placeholder="名前"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            padding: "12px",
            border: "1px solid #ccc",
            borderRadius: "8px",
            fontSize: "16px",
            width: "100%",
          }}
        />

        <input
          type="text"
          placeholder="Xアカウント（@から）"
          value={xAccount}
          onChange={(e) => setXAccount(e.target.value)}
          style={{
            padding: "12px",
            border: "1px solid #ccc",
            borderRadius: "8px",
            fontSize: "16px",
            width: "100%",
          }}
        />

        <button
          onClick={save}
          style={{
            padding: "12px",
            background: "#4f46e5",
            color: "white",
            borderRadius: "8px",
            border: "none",
            fontSize: "18px",
            cursor: "pointer",
            marginTop: "10px",
          }}
        >
          保存する
        </button>
      </div>
    </div>
  );
}
