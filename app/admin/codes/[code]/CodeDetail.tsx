"use client";

import type { DocumentData } from "firebase/firestore";

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

export default function CodeDetail({ code }: { code: string }) {
  const [codeInfo, setCodeInfo] = useState<DocumentData | null>(null);
  const [usageList, setUsageList] = useState<DocumentData[]>([]);

  const fetchCodeInfo = async () => {
    const codeRef = doc(db, "validCodes", code);
    const snap = await getDoc(codeRef);

    if (snap.exists()) {
      setCodeInfo({ id: code, ...snap.data() });
    }
  };

  const fetchUsage = async () => {
    const q = query(
      collection(db, "pointHistory"),
      where("code", "==", code),
      orderBy("createdAt", "desc")
    );

    const snap = await getDocs(q);

    const list: DocumentData[] = [];

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (typeof data.userId !== "string") continue;

      const userRef = doc(db, "users", data.userId);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : null;

      list.push({
        id: docSnap.id,
        ...data,
        email: userData?.email ?? "不明",
        displayName: userData?.displayName ?? "名称未登録",
        xAccount: userData?.xAccount ?? "Xアカウント未登録",
      });
    }

    setUsageList(list);
  };

  useEffect(() => {
    void Promise.all([
      Promise.resolve().then(fetchCodeInfo),
      Promise.resolve().then(fetchUsage),
    ]);
  }, [code]);

  if (!codeInfo) return <p>読み込み中…</p>;

  return (
    <div style={{ padding: "20px", maxWidth: "700px", margin: "0 auto" }}>
      <h1>コード詳細</h1>

      <div
        style={{
          padding: "12px",
          border: "1px solid #ccc",
          borderRadius: "8px",
          marginBottom: "20px",
        }}
      >
        <p><strong>コード：</strong> {codeInfo.id}</p>
        <p><strong>付与ポイント：</strong> {codeInfo.points} pt</p>
        <p>
          <strong>タイプ：</strong>{" "}
          {codeInfo.type === "global"
            ? "全員で1回だけ使える"
            : codeInfo.type === "limited"
            ? `各ユーザー1回・先着${codeInfo.maxUses ?? 0}人まで`
            : codeInfo.type === "perUser"
            ? "全員が1回ずつ使える"
            : "不明"}
        </p>
        <p>
          <strong>使用人数：</strong>{" "}
          {codeInfo.type === "limited"
            ? codeInfo.usedCount ?? usageList.length
            : usageList.length}
          {codeInfo.type === "limited"
            ? ` / ${codeInfo.maxUses ?? 0}`
            : ""} 人
        </p>
        <p>
          <strong>作成日時：</strong>{" "}
          {codeInfo.createdAt?.toDate
            ? codeInfo.createdAt.toDate().toLocaleString()
            : "不明"}
        </p>
      </div>

      <h2>使用したユーザー一覧</h2>

      {usageList.length === 0 && <p>まだ使用されていません。</p>}

      {usageList.map((item) => (
        <div
          key={item.id}
          style={{
            padding: "12px",
            marginTop: "12px",
            border: "1px solid #ccc",
            borderRadius: "8px",
          }}
        >
          <p><strong>ニックネーム：</strong> {item.displayName}</p>
          <p><strong>Xアカウント：</strong> {item.xAccount}</p>
          <p><strong>メール：</strong> {item.email}</p>
          <p><strong>UID：</strong> {item.userId}</p>
          <p><strong>付与ポイント：</strong> {item.added} pt</p>
          <p>
            <strong>使用日時：</strong>{" "}
            {item.createdAt?.toDate
              ? item.createdAt.toDate().toLocaleString()
              : "不明"}
          </p>
        </div>
      ))}
    </div>
  );
}
