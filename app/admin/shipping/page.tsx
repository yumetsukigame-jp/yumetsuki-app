"use client";

import { useEffect, useState } from "react";
import { db } from "../../../firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  getDoc,
} from "firebase/firestore";

export default function ShippingAdminPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const snap = await getDocs(collection(db, "selectedRewards"));

    const data = [];

    for (const d of snap.docs) {
      const uid = d.id;
      const rewardData = d.data();

      // ★ users コレクションからユーザー情報を取得
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);

      const userData = userSnap.exists()
        ? userSnap.data()
        : { name: "不明", email: "不明" };

      data.push({
        uid,
        ...rewardData,
        userName: userData.name ?? "不明",
        userEmail: userData.email ?? "不明",
      });
    }

    setList(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ★ 発送済みフラグ切り替え ＋ 履歴保存
  const toggleShipped = async (uid: string, shipped: boolean, item: any) => {
    const ref = doc(db, "selectedRewards", uid);

    if (!shipped) {
      const shippedAt = new Date();

      await updateDoc(ref, {
        shipped: true,
        shippedAt,
      });

      // ★ 発送履歴に保存
      await addDoc(collection(db, "shippingHistory"), {
        uid,
        rewardName: item.name,
        cost: item.cost,
        image: item.image,
        shippedAt,
        userName: item.userName,
        userEmail: item.userEmail,
      });
    } else {
      await updateDoc(ref, {
        shipped: false,
        shippedAt: null,
      });
    }

    fetchData();
  };

  if (loading) return <p style={{ padding: 20 }}>読み込み中…</p>;

  return (
    <div style={{ padding: "20px", maxWidth: "900px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>
        発送管理（ユーザーが選んだ発送物一覧）
      </h1>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {list.map((item) => (
          <div
            key={item.uid}
            style={{
              border: "1px solid #ddd",
              borderRadius: "8px",
              padding: "16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <p><strong>ユーザー名：</strong> {item.userName}</p>
              <p><strong>メール：</strong> {item.userEmail}</p>
              <p><strong>ユーザーID：</strong> {item.uid}</p>
              <p><strong>発送物：</strong> {item.name}</p>
              <p><strong>ポイント：</strong> {item.cost} pt</p>
              <p><strong>選択日時：</strong> {item.timestamp?.toDate().toLocaleString()}</p>

              {item.shipped && (
                <p style={{ color: "green" }}>
                  <strong>発送済み：</strong>{" "}
                  {item.shippedAt?.toDate().toLocaleString()}
                </p>
              )}
            </div>

            <button
              onClick={() => toggleShipped(item.uid, item.shipped, item)}
              style={{
                padding: "10px 16px",
                background: item.shipped ? "#aaa" : "#10b981",
                color: "white",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                minWidth: "140px",
              }}
            >
              {item.shipped ? "未発送に戻す" : "発送済みにする"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
