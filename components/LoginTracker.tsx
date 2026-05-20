"use client";

import { useEffect } from "react";
import { auth, db } from "@/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, updateDoc, increment } from "firebase/firestore";

export default function LoginTracker() {
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        await updateDoc(doc(db, "users", u.uid), {
          lastLogin: new Date(),
          loginCount: increment(1),
        });
      }
    });

    return () => unsub();
  }, []);

  return null; // 画面には何も表示しない
}
