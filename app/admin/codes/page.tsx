"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function CodeDetailPage({ params }: { params: { code: string } }) {
  const code = params.code;

  const [codeInfo, setCodeInfo] = useState<any>(null);

  useEffect(() => {
    const fetchCodeInfo = async () => {
      const ref = doc(db, "usedCodes", code);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        setCodeInfo(snap.data());
      } else {
        setCodeInfo(null);
      }
    };

    fetchCodeInfo();
  }, [code]);

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1>コード詳細</h1>

      {!codeInfo && <p>このコードの情報はありません。</p>}

      {codeInfo && (
        <div
          style={{
            padding: "12px",
            marginTop: "12px",
            border: "1px solid #ccc",
            borderRadius: "8px",
          }}
        >
          <p><strong>コード：</strong> {code}</p>
          <p><strong>ユーザー：</strong> {codeInfo.user}</p>
          <p>
            <strong>使用日時：</strong>{" "}
            {codeInfo.usedAt?.toDate
              ? codeInfo.usedAt.toDate().toLocaleString()
              : String(codeInfo.usedAt)}
          </p>
        </div>
      )}
    </div>
  );
}
