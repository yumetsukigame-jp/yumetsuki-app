"use client";

import { useEffect } from "react";
import { auth, functions } from "@/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";

export default function LoginTracker() {
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        try {
          await httpsCallable<
            Record<string, never>,
            {
              recorded: boolean;
              loginDate: string;
              totalLoginDays: number;
            }
          >(functions, "recordDailyLogin")({});
        } catch (error) {
          console.error("ログイン記録の更新に失敗しました", error);
        }
      }
    });

    return () => unsub();
  }, []);

  return null;
}
