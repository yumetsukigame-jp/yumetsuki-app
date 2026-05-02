"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  getDoc,
} from "firebase/firestore";

export default function UserHistoryPage(
  { params }: { params: { uid: string } }
) {
  const uid = params.uid;

  const [user, setUser] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);

  // ユーザー情報取得
  const fetchUser = async () => {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      setUser({ id: uid, ...snap.data() });
    }
  };

  // 履歴取得 + コードタイプ取得
  const fetchHistory = async () => {
    const q = query(
      collection(db, "pointHistory"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc")
    );

    const snap = await getDocs(q);

    const list: any[] = [];

    for (const docSnap of snap.docs) {
      const data = docSnap.data();

      // validCodes から type を取得
      const codeRef = doc(db, "validCodes", data.code);
      const codeSnap = await getDoc(codeRef);

      const type = codeSnap.exists() ? codeSnap.data().type : "不明";

      list.push({
        id: docSnap.id,
        ...data,
        type,
      });
    }

    setHistory(list);

    // 合計ポイント計算
    const total = list.reduce((sum, item) => sum + (item.added || 0), 0);
    setTotalPoints(total);
  };

  useEffect(() => {
    fetchUser();
    fetchHistory();
  }, [uid]);

  if (!user) return <p>読み込み中…</p>;

  return (
    <div style={{ padding: "20px", maxWidth: "700px", margin: "0 auto" }}>
      <h1>ユーザー履歴</h1>

      <div
        style={{
          padding: "12px",
          border: "1px solid