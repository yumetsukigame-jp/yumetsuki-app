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
  deleteDoc,
  Timestamp,
} from "firebase/firestore";

export default function ShippingAdminPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ★ 発送済みカードの開閉状態
  const [openMap, setOpenMap] = useState<{ [uid: string]: boolean }>({});

  // ★ ページネーション
  const [page, setPage] = useState(1);
  const perPage = 10;

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
        : {
            name: "不明",
            email: "不明",
            xAccount: "不明",
            displayName: "名無し",
            xAccountConfirmed: false,
          };

      data.push({
        uid,
        ...rewardData,
        userName: userData.name ?? "不明",
        userEmail: userData.email ?? "不明",
        userX: userData.xAccount ?? "不明",
        userNickname: userData.displayName ?? "名無し",
        xAccountConfirmed: userData.xAccountConfirmed ?? false,
      });
    }

    // ★ 未発送 → 発送済み の順
    // ★ 同じ発送状態なら timestamp の降順
    data.sort((a, b) => {
      if (a.shipped !== b.shipped) {
        return a.shipped ? 1 : -1;
      }

      const tA = a.timestamp?.toDate
        ? a.timestamp.toDate().getTime()
        : new Date(a.timestamp).getTime();

      const tB = b.timestamp?.toDate
        ? b.timestamp.toDate().getTime()
        : new Date(b.timestamp).getTime();

      return tB - tA;
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
      const shippedAt = Timestamp.now(); // ← Firestore Timestamp に統一

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
        userNickname: item.userNickname,
      });
    } else {
      await updateDoc(ref, {
        shipped: false,
        shippedAt: null,
      });
    }

    fetchData();
  };

  // ★ Xアカウント確定
  const confirmXAccount = async (uid: string) => {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
      xAccountConfirmed: true,
    });
    fetchData();
  };

  if (loading) return <p style={{ padding: 20 }}>読み込み中…</p>;

  // ★ ページ分割
  const paginatedList = list.slice((page - 1) * perPage, page * perPage);

  // ★ Timestamp / Date 両対応
  const formatDate = (value: any) => {
    if (!value) return "日時不明";
    if (value.toDate) return value.toDate().toLocaleString();
    return new Date(value).toLocaleString();
  };

  return (
    <div style={{ padding: "20px", maxWidth: "900px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>
        発送管理（ユーザーが選んだ発送物一覧）
      </h1>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {paginatedList.map((item) => {
          const isOpen = openMap[item.uid] ?? !item.shipped;

          return (
            <div
              key={item.uid}
              style={{
                border: "1px solid #ddd",
                borderRadius: "8px",
                padding: "16px",
                background: item.shipped ? "#f5f5f5" : "#fffbe6",
              }}
            >
              {/* ▼▼▼ ヘッダー ▼▼▼ */}
              <div
                onClick={() => toggleOpen(item.uid)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.name}
                      style={{
                        width: "40px",
                        height: "40px",
                        objectFit: "contain",
                        borderRadius: "6px",
                      }}
                    />
                  )}

                  <div>
                    <strong>{item.name}</strong>
                    <br />

                    <span style={{ fontSize: "13px", color: "#444" }}>
                      {item.userNickname}（{item.userX}）
                    </span>
                    <br />

                    <span style={{ fontSize: "12px", color: "#666" }}>
                      {item.shipped
                        ? `発送済み：${formatDate(item.shippedAt)}`
                        : "未発送"}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: "20px" }}>{isOpen ? "▲" : "▼"}</div>
              </div>
              {/* ▲▲▲ ヘッダーここまで ▲▲▲ */}

              {/* ▼▼▼ 詳細 ▼▼▼ */}
              {isOpen && (
                <div style={{ marginTop: "12px" }}>
                  <p><strong>ニックネーム：</strong> {item.userNickname}</p>
                  <p><strong>X：</strong> {item.userX}</p>

                  <p>
                    <strong>Xアカウント確定：</strong>{" "}
                    {item.xAccountConfirmed ? (
                      <span style={{ color: "green" }}>✔ 確定済み</span>
                    ) : (
                      <button
                        onClick={() => confirmXAccount(item.uid)}
                        style={{
                          padding: "6px 12px",
                          background: "#3b82f6",
                          color: "white",
                          borderRadius: "6px",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        Xアカウントを確定
                      </button>
                    )}
                  </p>

                  <p><strong>ユーザーID：</strong> {item.uid}</p>
                  <p><strong>ポイント：</strong> {item.cost} pt</p>
                  <p><strong>選択日時：</strong> {formatDate(item.timestamp)}</p>

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
              {/* ▲▲▲ 詳細ここまで ▲▲▲ */}
            </div>
          );
        })}
      </div>

      {/* ページネーション */}
      <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          前へ
        </button>

        <span>ページ {page}</span>

        <button
          disabled={page * perPage >= list.length}
          onClick={() => setPage(page + 1)}
        >
          次へ
        </button>
      </div>
    </div>
  );
}
