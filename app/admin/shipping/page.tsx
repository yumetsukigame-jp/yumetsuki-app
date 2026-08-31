"use client";

import { useCallback, useEffect, useState } from "react";
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
  query,
  orderBy,
  setDoc,
} from "firebase/firestore";
import LoadingState from "@/app/components/LoadingState";
import { withRetry } from "@/app/lib/retry";

type UserData = {
  name?: string;
  email?: string;
  xAccount?: string;
  displayName?: string;
  xAccountConfirmed?: boolean;
};

type PendingItem = {
  id: string;
  uid: string;
  source: "pending" | "done" | "legacy" | "history";
  rewardId?: string;
  name?: string;
  cost?: number;
  image?: string | null;
  requestedAt?: { toDate: () => Date } | Date | number | string | null;
  timestamp?: { toDate: () => Date } | Date | number | string | null;
  shipped?: boolean;
  shippedAt?: { toDate: () => Date } | Date | number | string | null;
  status?: "pending" | "done";
  userName?: string;
  userEmail?: string;
  userX?: string;
  userNickname?: string;
  xAccountConfirmed?: boolean;
};

export default function ShippingAdminPage() {
  const [list, setList] = useState<PendingItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<"pending" | "done" | "all">(
    "pending"
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const [openMap, setOpenMap] = useState<{ [id: string]: boolean }>({});
  const [page, setPage] = useState(1);
  const perPage = 10;

  const toggleOpen = (id: string) => {
    setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  /* --------------------------------------------------
     データ取得（未発送・発送済み・過去履歴を統合）
  -------------------------------------------------- */
  const fetchData = useCallback(async () => {
    try {
    const [pendingSnap, doneSnap, legacySnap, historySnap] = await Promise.all([
      withRetry(
        () =>
          getDocs(
            query(collection(db, "shippingPending"), orderBy("requestedAt", "desc"))
          ),
        2,
        500,
        10_000
      ),
      withRetry(() => getDocs(collection(db, "shippingDone")), 2, 500, 10_000),
      withRetry(() => getDocs(collection(db, "selectedRewards")), 2, 500, 10_000),
      withRetry(() => getDocs(collection(db, "shippingHistory")), 2, 500, 10_000),
    ]);

    const loadShippingItem = async (
      d: (typeof pendingSnap.docs)[number],
      source: PendingItem["source"]
    ) => {
      const rewardId = d.id;
      const rewardData = d.data();
      const uid = rewardData.uid;

      if (!uid) {
        console.warn("shippingPending に uid がありません:", rewardId);
        return null;
      }

      const userSnap = await withRetry(
        () => getDoc(doc(db, "users", uid)),
        2,
        500,
        10_000
      );
      const userData = userSnap.exists() ? (userSnap.data() as UserData) : null;

      return {
        id: rewardId,
        uid,
        ...rewardData,
        name: rewardData.name ?? rewardData.rewardName ?? "名称不明",
        requestedAt: rewardData.requestedAt ?? rewardData.timestamp ?? null,
        source,
        userName: userData?.name ?? "不明",
        userEmail: userData?.email ?? "不明",
        userX: userData?.xAccount ?? "不明",
        userNickname: userData?.displayName ?? "名無し",
        xAccountConfirmed: userData?.xAccountConfirmed ?? false,
      } satisfies PendingItem;
    };

    const loadItems = async (
      docs: (typeof pendingSnap.docs),
      source: PendingItem["source"]
    ) =>
      (await Promise.all(docs.map((item) => loadShippingItem(item, source)))).filter(
        (item): item is PendingItem => item !== null
      );

    const [pendingItems, doneItems, legacyItems, historyItems] = await Promise.all([
      loadItems(pendingSnap.docs, "pending"),
      loadItems(doneSnap.docs, "done"),
      loadItems(legacySnap.docs, "legacy"),
      loadItems(historySnap.docs, "history"),
    ]);

    const requestKey = (item: PendingItem) => `${item.uid}:${item.rewardId ?? item.id}`;
    const currentItems = [...pendingItems, ...doneItems];
    const currentRequestKeys = new Set(currentItems.map(requestKey));

    for (const item of legacyItems) {
      if (!currentRequestKeys.has(requestKey(item))) {
        currentItems.push(item);
        currentRequestKeys.add(requestKey(item));
      }
    }

    const data = [
      ...currentItems,
      ...historyItems.filter((item) => !currentRequestKeys.has(requestKey(item))),
    ];

    data.sort((a, b) => {
      const toComparableTime = (value?: PendingItem["requestedAt"] | PendingItem["timestamp"]) => {
        if (!value) return 0;
        if (value instanceof Date) return value.getTime();
        if (typeof value === "object" && "toDate" in value) return value.toDate().getTime();
        return new Date(value).getTime();
      };

      const tA = toComparableTime(a.requestedAt ?? a.timestamp ?? a.shippedAt);
      const tB = toComparableTime(b.requestedAt ?? b.timestamp ?? b.shippedAt);
      return tB - tA;
    });

    setList(data);
    setLoadError(false);
    setLoading(false);
    } catch (error) {
      console.error("発送管理データの読み込みに失敗しました", error);
      setLoadError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchData, retryKey]);

  /* --------------------------------------------------
     発送済みフラグ切り替え ＋ 履歴保存
  -------------------------------------------------- */
  const toggleShipped = async (rewardId: string, shipped: boolean, item: PendingItem) => {
    const pendingRef = doc(db, "shippingPending", item.uid);
    const doneRef = doc(db, "shippingDone", item.uid);
    const legacyRef = doc(db, "selectedRewards", item.uid);

    if (!shipped) {
      const shippedAt = Timestamp.now();

      await setDoc(doneRef, {
        ...item,
        uid: item.uid,
        rewardId: item.rewardId ?? rewardId,
        status: "done",
        shipped: true,
        shippedAt,
      });

      await deleteDoc(pendingRef);
      await updateDoc(legacyRef, {
        status: "done",
        shipped: true,
        shippedAt,
      }).catch(() => {
        setDoc(legacyRef, {
          ...item,
          uid: item.uid,
          rewardId: item.rewardId ?? rewardId,
          status: "done",
          shipped: true,
          shippedAt,
        });
      });

      await addDoc(collection(db, "shippingHistory"), {
        rewardId: item.rewardId ?? rewardId,
        uid: item.uid,
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
      await setDoc(pendingRef, {
        ...item,
        status: "pending",
        shipped: false,
        shippedAt: null,
      });
      await deleteDoc(doneRef);
      await updateDoc(legacyRef, {
        status: "pending",
        shipped: false,
        shippedAt: null,
      }).catch(() => {
        setDoc(legacyRef, {
          ...item,
          status: "pending",
          shipped: false,
          shippedAt: null,
        });
      });
    }

    fetchData();
  };

  /* --------------------------------------------------
     Xアカウント確定
  -------------------------------------------------- */
  const confirmXAccount = async (uid: string) => {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
      xAccountConfirmed: true,
    });
    fetchData();
  };

  if (loading) return <LoadingState message="発送管理データを読み込み中…" />;

  if (loadError) {
    return (
      <div style={{ padding: 20, textAlign: "center" }}>
        <p>発送管理データを取得できませんでした。</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setLoadError(false);
            setRetryKey((key) => key + 1);
          }}
          style={{
            padding: "8px 16px",
            border: "none",
            borderRadius: 6,
            background: "#2563eb",
            color: "white",
            cursor: "pointer",
          }}
        >
          再取得
        </button>
      </div>
    );
  }

  const isDone = (item: PendingItem) =>
    item.source === "done" ||
    item.source === "history" ||
    item.status === "done" ||
    Boolean(item.shipped);
  const filteredList = list.filter((item) => {
    if (statusFilter === "all") return true;
    return statusFilter === "done" ? isDone(item) : !isDone(item);
  });
  const paginatedList = filteredList.slice((page - 1) * perPage, page * perPage);

  const formatDate = (value: PendingItem["requestedAt"] | PendingItem["timestamp"] | PendingItem["shippedAt"] | null | undefined) => {
    if (!value) return "日時不明";
    if (value instanceof Date) return value.toLocaleString();
    if (typeof value === "object" && "toDate" in value) return value.toDate().toLocaleString();
    return new Date(value).toLocaleString();
  };

  return (
    <div style={{ padding: "20px", maxWidth: "900px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>
        発送管理
      </h1>
      <p style={{ color: "#555", marginTop: -12 }}>
        未発送の依頼確認と発送済み履歴を、この画面でまとめて管理できます。
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {([
          ["pending", "未発送"],
          ["done", "発送済み"],
          ["all", "すべて"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setStatusFilter(value);
              setPage(1);
            }}
            style={{
              padding: "8px 12px",
              border: "1px solid #2563eb",
              borderRadius: 6,
              background: statusFilter === value ? "#2563eb" : "white",
              color: statusFilter === value ? "white" : "#2563eb",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            {label}（
            {value === "all"
              ? list.length
              : list.filter((item) => (value === "done" ? isDone(item) : !isDone(item)))
                .length}
            ）
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {paginatedList.map((item) => {
          const itemIsDone = isDone(item);
          const isOpen = openMap[item.id] ?? !itemIsDone;

          return (
            <div
              key={item.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: "8px",
                padding: "16px",
                background: itemIsDone ? "#f5f5f5" : "#fffbe6",
              }}
            >
              {/* ▼ ヘッダー */}
              <div
                onClick={() => toggleOpen(item.id)}
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
                      {itemIsDone
                        ? `発送済み：${formatDate(item.shippedAt)}`
                        : "未発送"}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: "20px" }}>{isOpen ? "▲" : "▼"}</div>
              </div>

              {/* ▼ 詳細 */}
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
                    onClick={() => toggleShipped(item.id, itemIsDone, item)}
                    style={{
                      marginTop: "12px",
                      padding: "10px 16px",
                      background: itemIsDone ? "#aaa" : "#10b981",
                      color: "white",
                      borderRadius: "8px",
                      border: "none",
                      cursor: "pointer",
                      minWidth: "140px",
                    }}
                  >
                    {itemIsDone ? "未発送に戻す" : "発送済みにする"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredList.length === 0 && (
        <p style={{ textAlign: "center", color: "#666", marginTop: 32 }}>
          {statusFilter === "pending"
            ? "未発送の依頼はありません。"
            : statusFilter === "done"
              ? "発送済みの履歴はありません。"
              : "発送依頼はありません。"}
        </p>
      )}

      {/* ページネーション */}
      <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          前へ
        </button>

        <span>ページ {page}</span>

        <button
          disabled={page * perPage >= filteredList.length}
          onClick={() => setPage(page + 1)}
        >
          次へ
        </button>
      </div>
    </div>
  );
}
