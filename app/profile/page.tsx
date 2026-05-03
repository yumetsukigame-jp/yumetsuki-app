"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

export default function ProfilePage() {
  const [name, setName] = useState("");
  const [xAccount, setXAccount] = useState("");

  useEffect(() => {
    const load = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        setName(snap.data().name ?? "");
        setXAccount(snap.data().xAccount ?? "");
      }
    };

    load();
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

  return (
    <div style={{ padding: 20 }}>
      <h1>プロフィール編集</h1>

      <input
        type="text"
        placeholder="名前"
        value={name}
        onChange={(e) => setName(e.target.value)}
      /><br />

      <input
        type="text"
        placeholder="Xアカウント（@から）"
        value={xAccount}
        onChange={(e) => setXAccount(e.target.value)}
      /><br />

      <button onClick={save}>保存</button>
    </div>
  );
}
