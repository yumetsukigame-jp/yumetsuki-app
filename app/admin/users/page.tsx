"use client";

import { useEffect, useState } from "react";
import { db } from "@/firebase";
import {
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDocs,
  limit,
  orderBy,
  query,
  QueryDocumentSnapshot,
  startAfter,
  updateDoc,
} from "firebase/firestore";
import Link from "next/link";

const PAGE_SIZE = 50;

type UserRecord = {
  id: string;
  email?: string;
  name?: string;
  displayName?: string;
  xAccount?: string;
  subscriber?: boolean;
  xAccountConfirmed?: boolean;
  points?: number;
  loginCount?: number;
  lastLogin?: { toDate?: () => Date } | Date | null;
  createdAt?: { toDate?: () => Date } | Date | null;
};

type SortOrder =
  | "createdDesc"
  | "createdAsc"
  | "pointsDesc"
  | "pointsAsc"
  | "lastLoginDesc"
  | "lastLoginAsc";

const sortConfig: Record<SortOrder, { field: string; direction: "asc" | "desc" }> = {
  createdDesc: { field: "createdAt", direction: "desc" },
  createdAsc: { field: "createdAt", direction: "asc" },
  pointsDesc: { field: "points", direction: "desc" },
  pointsAsc: { field: "points", direction: "asc" },
  lastLoginDesc: { field: "lastLogin", direction: "desc" },
  lastLoginAsc: { field: "lastLogin", direction: "asc" },
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [filtered, setFiltered] = useState<UserRecord[]>([]);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("createdDesc");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<
    Array<QueryDocumentSnapshot<DocumentData> | null>
  >([null]);
  const [hasNextPage, setHasNextPage] = useState(false);

  const filterUsers = (list: UserRecord[], text: string) => {
    const keyword = text.trim().toLowerCase();
    if (!keyword) return list;

    return list.filter((user) =>
      [user.email, user.name, user.displayName, user.xAccount].some((value) =>
        String(value ?? "").toLowerCase().includes(keyword)
      )
    );
  };

  const loadPage = async (
    page: number,
    cursor: QueryDocumentSnapshot<DocumentData> | null
  ) => {
    setLoading(true);
    setLoadError("");

    try {
      const { field, direction } = sortConfig[sortOrder];
      const usersRef = collection(db, "users");
      const userQuery = query(
        usersRef,
        orderBy(field, direction),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(userQuery);
      const list = snap.docs.map((userDoc) => ({
        id: userDoc.id,
        ...(userDoc.data() as Omit<UserRecord, "id">),
      }));

      setUsers(list);
      setFiltered(filterUsers(list, search));
      setCurrentPage(page);
      setHasNextPage(snap.size === PAGE_SIZE);
      setPageCursors((previous) => {
        if (page === 1) {
          return [cursor, snap.docs.at(-1) ?? null];
        }

        const next = [...previous];
        next[page - 1] = cursor;
        next[page] = snap.docs.at(-1) ?? null;
        return next;
      });
    } catch (error) {
      console.error("ユーザー一覧の読み込みに失敗しました", error);
      setUsers([]);
      setFiltered([]);
      setLoadError("ユーザー一覧の読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  // The list intentionally reloads only when the sort field changes.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPage(1, null);
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortOrder]);

  const handleSearch = (text: string) => {
    setSearch(text);
    setFiltered(filterUsers(users, text));
  };

  const refreshCurrentPage = async () => {
    await loadPage(currentPage, pageCursors[currentPage - 1] ?? null);
  };

  const editPoints = async (uid: string, currentPoints: number) => {
    const input = prompt("新しいポイント数を入力してください", String(currentPoints));
    if (input === null) return;

    const newPoints = Number(input);
    if (Number.isNaN(newPoints)) {
      alert("数字を入力してください");
      return;
    }

    await updateDoc(doc(db, "users", uid), { points: newPoints });
    alert("ポイントを更新しました");
    await refreshCurrentPage();
  };

  const deleteUser = async (uid: string) => {
    if (!confirm("本当に削除しますか？")) return;

    await deleteDoc(doc(db, "users", uid));
    alert("ユーザーを削除しました");
    await refreshCurrentPage();
  };

  const confirmXAccount = async (uid: string) => {
    await updateDoc(doc(db, "users", uid), { xAccountConfirmed: true });
    alert("Xアカウントを確定しました");
    await refreshCurrentPage();
  };

  const editXAccount = async (uid: string, currentX?: string) => {
    const input = prompt("新しいXアカウントを入力してください", currentX ?? "");
    if (input === null) return;

    await updateDoc(doc(db, "users", uid), {
      xAccount: input,
      xAccountConfirmed: false,
    });
    alert("Xアカウントを更新しました");
    await refreshCurrentPage();
  };

  return (
    <div style={{ padding: "20px", maxWidth: "700px", margin: "0 auto" }}>
      <h1>ユーザー一覧</h1>
      <p style={{ color: "#555" }}>1ページあたり50件を表示しています。</p>

      <input
        type="text"
        value={search}
        onChange={(event) => handleSearch(event.target.value)}
        placeholder="現在の50件からメール・名前・ニックネーム・Xアカウントを検索"
        style={{
          width: "100%",
          padding: "10px",
          marginBottom: "15px",
          borderRadius: "6px",
          border: "1px solid #ccc",
        }}
      />

      <div style={{ marginBottom: "15px" }}>
        <label htmlFor="user-sort">並び替え：</label>
        <select
          id="user-sort"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value as SortOrder)}
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
          <option value="lastLoginDesc">ログインが新しい順</option>
          <option value="lastLoginAsc">ログインが古い順</option>
        </select>
      </div>

      {loading && <p>読み込み中…</p>}
      {loadError && <p style={{ color: "#dc2626" }}>{loadError}</p>}
      {!loading && !loadError && filtered.length === 0 && (
        <p>このページに該当するユーザーがいません。</p>
      )}

      {!loading &&
        filtered.map((user) => (
          <UserCard
            key={user.id}
            user={user}
            onEditPoints={editPoints}
            onDelete={deleteUser}
            onConfirmXAccount={confirmXAccount}
            onEditXAccount={editXAccount}
            onToggleSubscriber={async () => {
              await updateDoc(doc(db, "users", user.id), {
                subscriber: !user.subscriber,
              });
              alert("サブスク状態を更新しました");
              await refreshCurrentPage();
            }}
          />
        ))}

      {!loading && (
        <div style={{ marginTop: "20px", textAlign: "center" }}>
          <button
            disabled={currentPage === 1}
            onClick={() =>
              void loadPage(currentPage - 1, pageCursors[currentPage - 2] ?? null)
            }
            style={paginationButtonStyle(currentPage === 1)}
          >
            前へ
          </button>
          <span style={{ margin: "0 12px" }}>第 {currentPage} ページ</span>
          <button
            disabled={!hasNextPage}
            onClick={() =>
              void loadPage(currentPage + 1, pageCursors[currentPage] ?? null)
            }
            style={paginationButtonStyle(!hasNextPage)}
          >
            次へ
          </button>
        </div>
      )}
    </div>
  );
}

function UserCard({
  user,
  onEditPoints,
  onDelete,
  onConfirmXAccount,
  onEditXAccount,
  onToggleSubscriber,
}: {
  user: UserRecord;
  onEditPoints: (uid: string, points: number) => Promise<void>;
  onDelete: (uid: string) => Promise<void>;
  onConfirmXAccount: (uid: string) => Promise<void>;
  onEditXAccount: (uid: string, currentX?: string) => Promise<void>;
  onToggleSubscriber: () => Promise<void>;
}) {
  return (
    <div
      style={{
        padding: "12px",
        marginTop: "12px",
        border: "1px solid #ccc",
        borderRadius: "8px",
      }}
    >
      <p><strong>メール：</strong> {user.email || "不明"}</p>
      <p><strong>名前：</strong> {user.name || "未登録"}</p>
      <p><strong>ニックネーム：</strong> {user.displayName || "未登録"}</p>
      <p><strong>X：</strong> {user.xAccount || "未登録"}</p>
      <p><strong>サブスク：</strong> {user.subscriber ? "✔ サブスクライバー" : "—"}</p>
      <p><strong>UID：</strong> {user.id}</p>
      <p><strong>ポイント：</strong> {user.points ?? 0} pt</p>
      <p><strong>ログイン回数：</strong> {user.loginCount ?? 0} 回</p>
      <p><strong>最終ログイン：</strong> {formatDate(user.lastLogin)}</p>
      <p><strong>登録日時：</strong> {formatDate(user.createdAt)}</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
        <button onClick={onToggleSubscriber} style={buttonStyle(user.subscriber ? "#dc2626" : "#16a34a")}>
          {user.subscriber ? "サブスク解除" : "サブスク付与"}
        </button>
        {!user.xAccountConfirmed ? (
          <button onClick={() => void onConfirmXAccount(user.id)} style={buttonStyle("#16a34a")}>
            Xアカウントを確定
          </button>
        ) : (
          <button onClick={() => void onEditXAccount(user.id, user.xAccount)} style={buttonStyle("#2563eb")}>
            Xアカウントを編集
          </button>
        )}
        <button onClick={() => void onEditPoints(user.id, user.points ?? 0)} style={buttonStyle("#4f46e5")}>
          ポイント編集
        </button>
        <Link href={`/admin/users/${user.id}`} style={{ ...buttonStyle("#2563eb"), textDecoration: "none" }}>
          履歴を見る
        </Link>
        <button onClick={() => void onDelete(user.id)} style={buttonStyle("#dc2626")}>
          削除
        </button>
      </div>
    </div>
  );
}

function formatDate(value: UserRecord["createdAt"]) {
  if (value instanceof Date) return value.toLocaleString();
  if (value && typeof value.toDate === "function") return value.toDate().toLocaleString();
  return "不明";
}

function buttonStyle(background: string) {
  return {
    padding: "6px 10px",
    color: "white",
    background,
    borderRadius: "6px",
    border: "none",
    cursor: "pointer",
  };
}

function paginationButtonStyle(disabled: boolean) {
  return {
    padding: "6px 12px",
    borderRadius: "6px",
    border: "1px solid #ccc",
    background: disabled ? "#eee" : "white",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
