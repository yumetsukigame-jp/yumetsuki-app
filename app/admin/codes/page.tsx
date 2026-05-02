"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { collection, getDocs } from "firebase/firestore";

export default function UsedCodesPage() {
  const [codes, setCodes] = useState([]);

  useEffect(() => {
    const fetchCodes = async () => {
      const querySnapshot = await getDocs(collection(db, "usedCodes"));
      const list = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setCodes(list);
    };

    fetchCodes();
  }, []);

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1>使用済みコード一覧</h1>

      {codes.length === 0 && <p>まだ使用済みコードはありません。</p>}

      {codes.map((item) => (
        <div
          key={item.id}
          style={{
            padding: "12px",
            marginTop: "12px",
            border: "1px solid #ccc",
            borderRadius: "8px",
          }}
        >
          <p><strong>コード：</strong> {item.id}</p>
          <p><strong>ユーザー：</strong> {item.user}</p>
          <p>
            <strong>使用日時：</strong>{" "}
            {item.usedAt?.toDate
              ? item.usedAt.toDate().toLocaleString()
              : String(item.usedAt)}
          </p>
        </div>
      ))}
    </div>
  );
}
