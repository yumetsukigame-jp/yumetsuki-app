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

export default function CodeDetailPage({ params }) {
  const code = params.code;

  const [codeInfo, setCodeInfo] = useState(null);
  const [users, setUsers] = useState([]);
  const [usageList, setUsageList] = useState([]);

  // コード情報取得
  const fetchCodeInfo = async () => {
    const codeRef = doc(db, "validCodes", code);
    const snap = await getDoc(codeRef);

    if (snap.exists()) {
      setCodeInfo({ id: code, ...snap.data() });
    }
  };

  // 使用履歴取得
  const fetchUsage = async () => {
    const q = query(
      collection(db, "pointHistory"),
      where("code", "==", code),
      orderBy("createdAt", "desc")
    );

    const snap = await getDocs(q);

    const list = [];

    for (const docSnap of snap.docs) {
      const data = docSnap.data();

      // ユーザー情報取得
      const userRef = doc(db, "users", data.userId);
      const userSnap = await getDoc(userRef);

      const email = userSnap.exists() ? userSnap.data().email : "不明";

      list.push({
        id: docSnap.id,
        ...data,
        email,
      });
    }

    setUsageList(list);
  };

  useEffect(() => {
    fetchCodeInfo();
    fetchUsage();
  }, []);

  if (!codeInfo) return <p>読み込み中…</p>;

  return (
    <div style={{ padding: "20px", maxWidth: "700px", margin: "0 auto" }}>
      <h1>コード詳細</h1>

      {/* コード情報 */}
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
            : codeInfo.type === "perUser"
            ? "全員が1回ずつ使える"
            : "不明"}
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
          <p><strong>ユーザー：</strong> {item.email}</p>
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
