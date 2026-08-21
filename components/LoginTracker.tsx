"use client";

import { useEffect } from "react";
import { auth, db } from "@/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, updateDoc, increment } from "firebase/firestore";

export default function LoginTracker() {
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        try {
          await updateDoc(doc(db, "users", u.uid), {
            lastLogin: new Date(),
            loginCount: increment(1),
          });
        } catch (error) {
          console.error("ログイン記録の更新に失敗しました", error);
        }
      }
    });

    return () => unsub();
  }, []);

  return null; // 画面には何も表示しない
}
