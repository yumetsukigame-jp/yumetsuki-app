"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  orderBy,
  query,
} from "firebase/firestore";

export default function ValidCodesPage() {
  const [codes, setCodes] = useState([]);
  const [usage, setUsage] = useState({});
  const [userEmails, setUserEmails] = useState({});
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filtered, setFiltered] = useState([]);

  // コード一覧取得
  const fetchCodes = async () => {
    const q = query(
      collection(db, "validCodes"),
      orderBy("createdAt", sortOrder)
    );

    const querySnapshot = await getDocs(q);
    const list = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    setCodes(list);
    setFiltered(list);

    fetchUsage(list);
  };

  // 使用人数 + 使用ユーザー一覧を取得
  const fetchUsage = async (codeList) => {
    const usedSnap = await getDocs(collection(db, "usedCodes"));
    const usedDocs = usedSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    const usageMap = {};
    const emailMap = {};

    for (const code of codeList) {
      let usedUsers = [];

      if (code.type === "global") {
        // global → 1人 or 0人
        const used = usedDocs.find((u) => u.id === code.id);
        if (used) usedUsers.push(used.userId);
      } else {
        // perUser → uid_code の件数
        usedUsers = usedDocs
          .filter((u) => u.id.endsWith(`_${code.id}`))
          .map((u) => u.userId);
      }

      usageMap[code.id] = usedUsers.length;

      // uid → email に変換
      const emails = [];
      for (const uid of usedUsers) {
        const userRef = doc(db, "users", uid);
        const userSnap = await getDocs(collection(db, "users"));
        const userDoc = userSnap.docs.find((d) => d.id === uid);

        if (userDoc) {
          emails.push(userDoc.data().email || uid);
        } else {
          emails.push(uid);
        }
      }

      emailMap[code.id] = emails;
    }

    setUsage(usageMap);
    setUserEmails(emailMap);
  };

  useEffect(() => {
    fetchCodes();
  }, [sortOrder]);

  // 検索
  const handleSearch = (text) => {
    setSearch(text);

    if (!text) {
      setFiltered(codes);
      return;
    }

    const lower = text.toLowerCase();
    setFiltered(
      codes.filter((item) => item.id.toLowerCase().includes(lower))
    );
  };

  // 削除
  const handleDelete = async (codeId) => {
    if (!confirm(`コード「${codeId}」を削除しますか？`)) return;

    await deleteDoc(doc(db, "validCodes", codeId));
    alert("削除しました");

    fetchCodes();
  };

  return (
    <div style={{ padding: "20px", maxWidth: "700px", margin: "0 auto" }}>
      <h1>発行済みコード一覧</h1>

      {/* 検索 */}
      <input
        type="text"
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="コード名で検索"
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
          <option value="desc">新しい順</option>
          <option value="asc">古い順</option>
        </select>
      </div>

      {filtered.length === 0 && <p>コードがありません。</p>}

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
          <p><strong>コード：</strong> {item.id}</p>
          <p><strong>付与ポイント：</strong> {item.points} pt</p>
          <p>
            <strong>タイプ：</strong>{" "}
            {item.type === "global"
              ? "全員で1回だけ使える"
              : "全員が1回ずつ使える"}
          </p>

          {/* 使用人数 */}
          <p>
            <strong>使用人数：</strong>{" "}
            {usage[item.id] !== undefined ? usage[item.id] : "読み込み中…"} 人
          </p>

          {/* 使用ユーザー一覧 */}
          <p><strong>使用したユーザー：</strong></p>
          <ul>
            {userEmails[item.id]?.length > 0 ? (
              userEmails[item.id].map((email, index) => (
                <li key={index}>{email}</li>
              ))
            ) : (
              <li>まだ使用されていません</li>
            )}
          </ul>

          <p>
            <strong>作成日時：</strong>{" "}
            {item.createdAt?.toDate
              ? item.createdAt.toDate().toLocaleString()
              : "不明"}
          </p>

          {/* 削除ボタン */}
          <button
            onClick={() => handleDelete(item.id)}
            style={{
              marginTop: "10px",
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
