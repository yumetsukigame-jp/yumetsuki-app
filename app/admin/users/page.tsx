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
  where,
} from "firebase/firestore";
import Link from "next/link";

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState("createdDesc");

  const fetchUsers = async () => {
    // ★ createdAt が無いユーザーを自動修正
    const allSnap = await getDocs(collection(db, "users"));
    for (const d of allSnap.docs) {
      const data = d.data();
      if (!data.createdAt) {
        await updateDoc(doc(db, "users", d.id), {
          createdAt: new Date(),
        });
      }
    }

    // createdAt で並び替え
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    const list = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // 発送履歴数 & 発送待ち件数
    for (const user of list) {
      const hq = query(
        collection(db, "shippingHistory"),
        where("uid", "==", user.id)
      );
      const hsnap = await getDocs(hq);
      user.shippingCount = hsnap.size;

      const wq = query(
        collection(db, "shippingHistory"),
        where("uid", "==", user.id),
        where("shipped", "==", false)
      );
      const wsnap = await getDocs(wq);
      user.waitingCount = wsnap.size;
    }

    // ソート処理
    let sorted = [...list];

    if (sortOrder === "pointsDesc") {
      sorted.sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
    } else if (sortOrder === "pointsAsc") {
      sorted.sort((a, b) => (a.points ?? 0) - (b.points ?? 0));
    } else if (sortOrder === "createdAsc") {
      sorted.sort(
        (a, b) =>
          (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0)
      );
    } else {
      sorted.sort(
        (a, b) =>
          (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
      );
    }

    setUsers(sorted);
    setFiltered(sorted);
  };

  useEffect(() => {
    fetchUsers();
  }, [sortOrder]);

  // 検索（メール + 名前 + Xアカウント）
  const handleSearch = (text) => {
    setSearch(text);

    if (!text) {
      setFiltered(users);
      return;
    }

    const lower = text.toLowerCase();

    setFiltered(
      users.filter((u) => {
        const email = (u.email || "").toLowerCase();
        const name = (u.name || "").toLowerCase();
        const x = (u.xAccount || "").toLowerCase();

        return (
          email.includes(lower) ||
          name.includes(lower) ||
          x.includes(lower)
        );
      })
    );
  };

  // ポイント編集
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

  // ユーザー削除
  const deleteUser = async (uid) => {
    if (!confirm("このユーザーを削除しますか？")) return;

    await deleteDoc(doc(db, "users", uid));

    alert("ユーザーを削除しました");
    fetchUsers();
  };

  // Xアカウント確定
  const confirmXAccount = async (uid) => {
    await updateDoc(doc(db, "users", uid), {
      xAccountConfirmed: true,
    });

    alert("Xアカウントを確定しました");
    fetchUsers();
  };

  // Xアカウント編集
  const editXAccount = async (uid, currentX) => {
    const input = prompt("新しいXアカウントを入力してください", currentX);

    if (input === null) return;

    await updateDoc(doc(db, "users", uid), {
      xAccount: input,
      xAccountConfirmed: false,
    });

    alert("Xアカウントを更新しました");
    fetchUsers();
  };

  return (
    <div style={{ padding: "20px", maxWidth: "700px", margin: "0 auto" }}>
      <h1>ユーザー一覧</h1>

      {/* 検索欄 */}
      <input
        type="text"
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="メール・名前・Xアカウントで検索"
        style={{
          width: "100%",
          padding: "10px",
          marginBottom: "15px",
          borderRadius: "6px",
          border: "1px solid #ccc",
        }}
      />

      {/* 並び替え */}
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
          <option value="createdDesc">登録が新しい順</option>
          <option value="createdAsc">登録が古い順</option>
          <option value="pointsDesc">ポイントが多い順</option>
          <option value="pointsAsc">ポイントが少ない順</option>
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
          <p><strong>名前：</strong> {user.name || "未登録"}</p>
          <p><strong>X：</strong> {user.xAccount || "未登録"}</p>

          {/* ★ サブスク状態 */}
          <p><strong>サブスク：</strong> {user.subscriber ? "✔ サブスクライバー" : "—"}</p>

          <button
            onClick={async () => {
              await updateDoc(doc(db, "users", user.id), {
                subscriber: !user.subscriber,
              });
              alert("サブスク状態を更新しました");
              fetchUsers();
            }}
            style={{
              padding: "6px 10px",
              background: user.subscriber ? "#dc2626" : "#16a34a",
              color: "white",
              borderRadius: "6px",
              border: "none",
              marginBottom: "8px",
            }}
          >
            {user.subscriber ? "サブスク解除" : "サブスク付与"}
          </button>

          {!user.xAccountConfirmed ? (
            <button
              onClick={() => confirmXAccount(user.id)}
              style={{
                padding: "6px 10px",
                background: "#16a34a",
                color: "white",
                borderRadius: "6px",
                border: "none",
                marginBottom: "8px",
              }}
            >
              Xアカウントを確定
            </button>
          ) : (
            <button
              onClick={() => editXAccount(user.id, user.xAccount)}
              style={{
                padding: "6px 10px",
                background: "#2563eb",
                color: "white",
                borderRadius: "6px",
                border: "none",
                marginBottom: "8px",
              }}
            >
              編集
            </button>
          )}

          <p><strong>UID：</strong> {user.id}</p>
          <p><strong>ポイント：</strong> {user.points ?? 0} pt</p>
          <p><strong>発送履歴：</strong> {user.shippingCount} 件</p>
          <p><strong>発送待ち：</strong> {user.waitingCount} 件</p>

          <p>
            <strong>登録日時：</strong>{" "}
            {user.createdAt?.toDate
              ? user.createdAt.toDate().toLocaleString()
              : "不明"}
          </p>

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
