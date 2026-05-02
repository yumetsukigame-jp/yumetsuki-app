"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import Link from "next/link";

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState("desc");

  const fetchUsers = async () => {
    const q = query(collection(db, "users"), orderBy("createdAt", sortOrder));
    const snap = await getDocs(q);

    const list = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    setUsers(list);
    setFiltered(list);
  };

  useEffect(() => {
    fetchUsers();
  }, [sortOrder]);

  const handleSearch = (text) => {
    setSearch(text);

    if (!text) {
      setFiltered(users);
      return;
    }

    const lower = text.toLowerCase();
    setFiltered(users.filter((u) => (u.email || "").toLowerCase().includes(lower)));
  };

  // ★ ポイント編集
  const editPoints = async (uid, currentPoints) => {
    const input = prompt("新しいポイント数を入力してください", currentPoints);

    if (input === null) return;

    const newPoints = Number(input);
    if (isNaN(newPoints)) {
      alert("数字を入力してください");
      return;
    }

    await updateDoc(doc(db, "users", uid), {
      points: newPoints,
    });

    alert("ポイントを更新しました");
    fetchUsers();
  };

  // ★ ユーザー削除
  const deleteUser = async (uid) => {
    if (!confirm("このユーザーを削除しますか？")) return;

    await deleteDoc(doc(db, "users", uid));

    alert("ユーザーを削除しました");
    fetchUsers();
  };

  return (
    <div style={{ padding: "20px", maxWidth: "700px", margin: "0 auto" }}>
      <h1>ユーザー一覧</h1>

      <input
        type="text"
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="メールアドレスで検索"
        style={{
          width: "100%",
          padding: "10px",
          marginBottom: "15px",
          borderRadius: "6px",
          border: "1px solid #ccc",
        }}
      />

      <div style={{ marginBottom: "15px" }}>
        <label>並び替え：</label>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          style={{
            marginLeft: "10px",
            padding: "6px",
            borderRadius: "6px",
            border: "1px solid #ccc",
          }}
        >
          <option value="desc">新しい順</option>
          <option value="asc">古い順</option>
        </select>
      </div>

      {filtered.length === 0 && <p>ユーザーがいません。</p>}

      {filtered.map((user) => (
        <div
          key={user.id}
          style={{
            padding: "12px",
            marginTop: "12px",
            border: "1px solid #ccc",
            borderRadius: "8px",
          }}
        >
          <p><strong>メール：</strong> {user.email || "不明"}</p>
          <p><strong>UID：</strong> {user.id}</p>
          <p><strong>ポイント：</strong> {user.points ?? 0} pt</p>

          <p>
            <strong>登録日時：</strong>{" "}
            {user.createdAt?.toDate
              ? user.createdAt.toDate().toLocaleString()
              : "不明"}
          </p>

          {/* ★ ポイント編集 */}
          <button
            onClick={() => editPoints(user.id, user.points ?? 0)}
            style={{
              marginTop: "10px",
              padding: "8px 12px",
              background: "#4f46e5",
              color: "white",
              borderRadius: "6px",
              border: "none",
              marginRight: "10px",
            }}
          >
            ポイント編集
          </button>

          {/* ★ 履歴ページへ */}
          <Link href={`/admin/users/${user.id}`}>
            <button
              style={{
                padding: "8px 12px",
                background: "#2563eb",
                color: "white",
                borderRadius: "6px",
                border: "none",
                marginRight: "10px",
              }}
            >
              履歴を見る
            </button>
          </Link>

          {/* ★ ユーザー削除 */}
          <button
            onClick={() => deleteUser(user.id)}
            style={{
              padding: "8px 12px",
              background: "#dc2626",
              color: "white",
              borderRadius: "6px",
              border: "none",
            }}
          >
            削除
          </button>
        </div>
      ))}
    </div>
  );
}
