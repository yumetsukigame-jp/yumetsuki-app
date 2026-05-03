"use client";

import { useState } from "react";
import { auth, db } from "@/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [xAccount, setXAccount] = useState("");
  const router = useRouter();

  const handleSignup = async () => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await setDoc(doc(db, "users", user.uid), {
      email,
      name,
      xAccount,
      points: 0,
    });

    router.push("/");
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>新規登録</h1>

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

      <input
        type="email"
        placeholder="メールアドレス"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      /><br />

      <input
        type="password"
        placeholder="パスワード"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      /><br />

      <button onClick={handleSignup}>登録</button>
    </div>
  );
}
