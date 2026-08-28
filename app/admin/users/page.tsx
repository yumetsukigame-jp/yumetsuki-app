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
  const [isSearching, setIsSearching] = useState(false);
  const [searchCursor, setSearchCursor] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreSearchResults, setHasMoreSearchResults] = useState(false);
  const [searchedCount, setSearchedCount] = useState(0);
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

  const getUsers = async (
    cursor: QueryDocumentSnapshot<DocumentData> | null
  ) => {
    const { field, direction } = sortConfig[sortOrder];
    const usersRef = collection(db, "users");
    const userQuery = query(
      usersRef,
      orderBy(field, direction),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(PAGE_SIZE)
    );
    const snap = await getDocs(userQuery);

    return {
      list: snap.docs.map((userDoc) => ({
        id: userDoc.id,
        ...(userDoc.data() as Omit<UserRecord, "id">),
      })),
      lastDocument: snap.docs.at(-1) ?? null,
      hasMore: snap.size === PAGE_SIZE,
    };
  };

  const loadPage = async (
    page: number,
    cursor: QueryDocumentSnapshot<DocumentData> | null
  ) => {
    setLoading(true);
    setLoadError("");

    try {
      const { list, lastDocument, hasMore } = await getUsers(cursor);

      setUsers(list);
      setFiltered(list);
      setCurrentPage(page);
      setHasNextPage(hasMore);
      setPageCursors((previous) => {
        if (page === 1) {
          return [cursor, lastDocument];
        }

        const next = [...previous];
        next[page - 1] = cursor;
        next[page] = lastDocument;
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

  const searchUsers = async (
    cursor: QueryDocumentSnapshot<DocumentData> | null,
    reset = false
  ) => {
    const keyword = search.trim();
    if (!keyword) {
      setIsSearching(false);
      setFiltered(users);
      return;
    }

    setLoading(true);
    setLoadError("");
    try {
      const { list, lastDocument, hasMore } = await getUsers(cursor);
      const matches = filterUsers(list, keyword);

      setFiltered((previous) => (reset ? matches : [...previous, ...matches]));
      setIsSearching(true);
      setSearchCursor(lastDocument);
      setHasMoreSearchResults(hasMore);
      setSearchedCount((previous) => (reset ? list.length : previous + list.length));
    } catch (error) {
      console.error("ユーザー検索に失敗しました", error);
      setLoadError("ユーザー検索に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const refreshCurrentPage = async () => {
    if (isSearching && search.trim()) {
      await searchUsers(null, true);
      return;
    }
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
      <p style={{ color: "#555", lineHeight: 1.6 }}>
        通常表示は1ページあたり50件です。検索は50件ずつ確認し、一致したユーザーがあればそこで停止します。
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void searchUsers(null, true);
        }}
        style={{ display: "flex", gap: "8px", marginBottom: "15px" }}
      >
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="メール・名前・ニックネーム・Xアカウントを検索"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "10px",
            borderRadius: "6px",
            border: "1px solid #ccc",
          }}
        />
        <button type="submit" style={buttonStyle("#2563eb")}>
          検索
        </button>
      </form>

      <div style={{ marginBottom: "15px" }}>
        <label htmlFor="user-sort">並び替え：</label>
        <select
          id="user-sort"
          value={sortOrder}
          onChange={(event) => {
            setIsSearching(false);
            setSearchCursor(null);
            setHasMoreSearchResults(false);
            setSearchedCount(0);
            setSortOrder(event.target.value as SortOrder);
          }}
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
      {!loading && !loadError && isSearching && (
        <div
          style={{
            padding: "10px 12px",
            marginBottom: "12px",
            background: "#eff6ff",
            borderRadius: "8px",
            color: "#1e40af",
          }}
        >
          {searchedCount}件を確認中：{filtered.length}件一致
          {hasMoreSearchResults && "（次の50件も検索できます）"}
        </div>
      )}
      {!loading && !loadError && filtered.length === 0 && (
        <p>
          {isSearching
            ? "この50件には該当するユーザーがいません。"
            : "このページにユーザーがいません。"}
        </p>
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

      {!loading && isSearching && hasMoreSearchResults && (
        <div style={{ marginTop: "20px", textAlign: "center" }}>
          <button onClick={() => void searchUsers(searchCursor)} style={buttonStyle("#2563eb")}>
            継続して次の50件を検索
          </button>
        </div>
      )}

      {!loading && !isSearching && (
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
        padding: "16px",
        marginTop: "12px",
        border: "1px solid #ccc",
        borderRadius: "8px",
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
        <div>
          <strong style={{ fontSize: "1.05rem" }}>{user.displayName || user.name || "名称未登録"}</strong>
          <div style={{ color: "#555", fontSize: "0.9rem", marginTop: "3px", overflowWrap: "anywhere" }}>
            {user.email || "メールアドレス未登録"}
          </div>
        </div>
        <span
          style={{
            flexShrink: 0,
            padding: "4px 8px",
            borderRadius: "999px",
            background: user.subscriber ? "#dcfce7" : "#f3f4f6",
            color: user.subscriber ? "#166534" : "#4b5563",
            fontSize: "0.8rem",
            fontWeight: 700,
          }}
        >
          {user.subscriber ? "サブスク中" : "通常"}
        </span>
      </div>

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "8px 16px",
          margin: "16px 0 0",
          fontSize: "0.9rem",
        }}
      >
        <UserDetail label="氏名" value={user.name || "未登録"} />
        <UserDetail label="Xアカウント" value={user.xAccount || "未登録"} />
        <UserDetail label="ポイント" value={`${user.points ?? 0} pt`} />
        <UserDetail label="ログイン回数" value={`${user.loginCount ?? 0} 回`} />
        <UserDetail label="最終ログイン" value={formatDate(user.lastLogin)} />
        <UserDetail label="登録日時" value={formatDate(user.createdAt)} />
        <UserDetail label="UID" value={user.id} fullWidth />
      </dl>

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

function UserDetail({
  label,
  value,
  fullWidth = false,
}: {
  label: string;
  value: string;
  fullWidth?: boolean;
}) {
  return (
    <div style={fullWidth ? { gridColumn: "1 / -1" } : undefined}>
      <dt style={{ color: "#6b7280", fontSize: "0.8rem", fontWeight: 700 }}>{label}</dt>
      <dd style={{ margin: "2px 0 0", overflowWrap: "anywhere" }}>{value}</dd>
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
