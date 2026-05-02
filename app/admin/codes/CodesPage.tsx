"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { collection, getDocs } from "firebase/firestore";

export default function CodesPage() {
  const [codes, setCodes] = useState<any[]>([]);

  useEffect(() => {
    const fetchCodes = async () => {
      const snap = await getDocs(collection(db, "validCodes"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCodes(list);
    };

    fetchCodes();
  }, []);

  return (
    <div style={{ padding: "20px", maxWidth: "700px", margin: "0 auto" }}>
      <h1>コード一覧</h1>

      {codes.length === 0 && <p>まだコードがありません。</p>}

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
          <p><strong>ポイント：</strong> {item.points}</p>
          <p><strong>タイプ：</strong> {item.type}</p>
        </div>
      ))}
    </div>
  );
}
