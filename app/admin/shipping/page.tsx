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

  // ★ 発送済みカードの開閉状態
  const [openMap, setOpenMap] = useState<{ [uid: string]: boolean }>({});

  const toggleOpen = (uid: string) => {
    setOpenMap((prev) => ({ ...prev, [uid]: !prev[uid] }));
  };

  const fetchData = async () => {
    const snap = await getDocs(collection(db, "selectedRewards"));

    const data: any[] = [];

    for (const d of snap.docs) {
      const uid = d.id;
      const rewardData = d.data();

      // ★ users コレクションからユーザー情報を取得
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);

      const userData = userSnap.exists()
        ? userSnap.data()
        : { name: "不明", email: "不明", xAccount: "不明" };

      data.push({
        uid,
        ...rewardData,
        userName: userData.name ?? "不明",
        userEmail: userData.email ?? "不明",
        userX: userData.xAccount ?? "不明",
      });
    }

    // ★ 未発送 → 発送済み の順に並び替え
    data.sort((a, b) => {
      if (a.shipped === b.shipped) return 0;
      return a.shipped ? 1 : -1; // 未発送(false) が先
    });

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
        userX: item.userX,
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
        {list.map((item) => {
          const isOpen = openMap[item.uid] ?? !item.shipped; 
          // ★ 未発送は最初から開く、発送済みは閉じる

          return (
            <div
              key={item.uid}
              style={{
                border: "1px solid #ddd",
                borderRadius: "8px",
                padding: "16px",
                background: item.shipped ? "#f5f5f5" : "#fffbe6", // ★ 色分け
              }}
            >
              {/* ヘッダー部分（クリックで開閉） */}
              <div
                onClick={() => toggleOpen(item.uid)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  cursor: "pointer",
                }}
              >
                <div>
                  <strong>{item.userName}</strong>（{item.userEmail}）
                  <br />
                  <span style={{ fontSize: "12px", color: "#666" }}>
                    {item.shipped
                      ? `発送済み：${item.shippedAt
                          ?.toDate()
                          .toLocaleString()}`
                      : "未発送"}
                  </span>
                </div>

                <div style={{ fontSize: "20px" }}>
                  {isOpen ? "▲" : "▼"}
                </div>
              </div>

              {/* 詳細（開閉） */}
              {isOpen && (
                <div style={{ marginTop: "12px" }}>
                  <p><strong>X：</strong> {item.userX}</p>
                  <p><strong>ユーザーID：</strong> {item.uid}</p>
                  <p><strong>発送物：</strong> {item.name}</p>
                  <p><strong>ポイント：</strong> {item.cost} pt</p>
                  <p>
                    <strong>選択日時：</strong>{" "}
                    {item.timestamp?.toDate().toLocaleString()}
                  </p>

                  <button
                    onClick={() => toggleShipped(item.uid, item.shipped, item)}
                    style={{
                      marginTop: "12px",
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
