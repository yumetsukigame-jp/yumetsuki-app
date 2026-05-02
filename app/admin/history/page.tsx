"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import { collection, getDocs } from "firebase/firestore";

export default function PointHistoryPage() {
  const [history, setHistory] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("all");

  useEffect(() => {
    const fetchHistory = async () => {
      const querySnapshot = await getDocs(collection(db, "pointHistory"));
      const list = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setHistory(list);

      // uid の一覧を抽出（undefined/null を除外）
      const userList = Array.from(
        new Set(list.map((item) => item.userId).filter((uid) => uid))
      );

      setUsers(userList);

      setFiltered(list); // 初期表示は全件
    };

    fetchHistory();
  }, []);

  const handleFilter = (userId) => {
    setSelectedUser(userId);

    if (userId === "all") {
      setFiltered(history);
    } else {
      setFiltered(history.filter((item) => item.userId === userId));
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1>ポイント履歴一覧</h1>

      {/* ユーザーフィルタ */}
      <div style={{ marginBottom: "20px" }}>
        <label>ユーザーで絞り込み：</label>
        <select
          value={selectedUser}
          onChange={(e) => handleFilter(e.target.value)}
          style={{
            marginLeft: "10px",
            padding: "6px",
            borderRadius: "6px",
            border: "1px solid #ccc",
          }}
        >
          <option value="all">全ユーザー</option>

          {/* ★ key エラー対策：index を key に使用 */}
          {users.map((uid, index) => (
            <option key={index} value={uid}>
              {uid}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 && <p>履歴がありません。</p>}

      {filtered.map((item) => (
        <div
          key={item.id}
          style={{
            padding: "12px",
            marginTop: "12px",
            border: "1px solid #ccc",
            borderRadius: "8px",
          }}
        >
          <p><strong>ユーザーID：</strong> {item.userId}</p>
          <p><strong>コード：</strong> {item.code}</p>
          <p><strong>付与ポイント：</strong> {item.added} pt</p>
          <p>
            <strong>日時：</strong>{" "}
            {item.createdAt?.toDate
              ? item.createdAt.toDate().toLocaleString()
              : String(item.createdAt)}
          </p>
        </div>
      ))}
    </div>
  );
}
