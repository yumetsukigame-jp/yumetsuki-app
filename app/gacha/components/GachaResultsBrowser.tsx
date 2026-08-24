"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  collection,
  DocumentData,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  QueryDocumentSnapshot,
  startAfter,
  doc,
} from "firebase/firestore";
import { auth, db } from "@/firebase";

const PAGE_SIZE = 10;

type DateLike = { toDate: () => Date } | Date | null | undefined;

type GachaCode = {
  id: string;
  title: string;
  publicFlags: string[];
  thumbnail: string;
  frames: GachaFrame[];
  mode: "count" | "probability";
  totalCount: number | null;
  createdAt: DateLike;
};

type GachaFrame = {
  label: string;
  maxCount: number | null;
};

type GachaResult = {
  id: string;
  uid: string;
  frame: string;
  reward: number;
  createdAt: DateLike;
  userName: string;
};

type ResultPage = {
  items: GachaResult[];
  loading: boolean;
  error?: string;
};

type Props = {
  archived?: boolean;
  filterCode?: string;
};

const flagLabels: Record<string, string> = {
  public: "🌐 公開",
  limited: "🔒 限定",
  subscriber: "⭐ サブスク限定",
  nibuichi_winner: "🎯 的中者限定",
  x_account_match: "📝 Xアカウント一致",
};

export default function GachaResultsBrowser({
  archived = false,
  filterCode,
}: Props) {
  const [gachas, setGachas] = useState<GachaCode[]>([]);
  const [pages, setPages] = useState<Record<string, ResultPage>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [codeCursor, setCodeCursor] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreCodes, setHasMoreCodes] = useState(true);
  const [loadingMoreCodes, setLoadingMoreCodes] = useState(false);
  const userNameCache = useRef<Record<string, string>>({});
  const codesCollection = archived ? "gachaCodesArchive" : "gachaCodes";
  const resultsCollection = archived ? "gachaResultsArchive" : "gachaResults";

  const getUserName = async (uid: string) => {
    if (userNameCache.current[uid]) return userNameCache.current[uid];

    const userSnap = await getDoc(doc(db, "users", uid));
    if (!userSnap.exists()) {
      userNameCache.current[uid] = "名無し";
      return "名無し";
    }

    const user = userSnap.data();
    const name = typeof user.displayName === "string" ? user.displayName : "";
    const xAccount = typeof user.xAccount === "string"
      ? user.xAccount.replace(/^@+/, "")
      : "";
    const label = name && xAccount
      ? `${name}（@${xAccount}）`
      : name || (xAccount ? `@${xAccount}` : "名無し");

    userNameCache.current[uid] = label;
    return label;
  };

  useEffect(() => {
    const loadInitialGachas = async () => {
      setLoading(true);
      setGachas([]);
      setPages({});
      setOpen({});
      setCodeCursor(null);
      setHasMoreCodes(true);

      try {
        if (filterCode) {
          const gachaSnap = await getDoc(doc(db, codesCollection, filterCode));
          setGachas(gachaSnap.exists() ? [toGachaCode(gachaSnap)] : []);
          setHasMoreCodes(false);
          return;
        }

        const snap = await getDocs(
          query(
            collection(db, codesCollection),
            orderBy("createdAt", "desc"),
            limit(PAGE_SIZE)
          )
        );
        setGachas(snap.docs.map(toGachaCode));
        setCodeCursor(snap.docs.at(-1) ?? null);
        setHasMoreCodes(snap.size === PAGE_SIZE);
      } catch (error) {
        console.error("ガチャ一覧の読み込みに失敗しました", error);
        setGachas([]);
      } finally {
        setLoading(false);
      }
    };

    void loadInitialGachas();
  }, [codesCollection, filterCode]);

  const loadMoreGachas = async () => {
    if (!codeCursor || loadingMoreCodes || !hasMoreCodes) return;

    setLoadingMoreCodes(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, codesCollection),
          orderBy("createdAt", "desc"),
          startAfter(codeCursor),
          limit(PAGE_SIZE)
        )
      );
      setGachas((previous) => [...previous, ...snap.docs.map(toGachaCode)]);
      setCodeCursor(snap.docs.at(-1) ?? codeCursor);
      setHasMoreCodes(snap.size === PAGE_SIZE);
    } catch (error) {
      console.error("ガチャ一覧の追加読み込みに失敗しました", error);
    } finally {
      setLoadingMoreCodes(false);
    }
  };

  const loadResults = async (code: string) => {
    const current = pages[code];
    if (current?.loading) return;

    setPages((previous) => ({
      ...previous,
      [code]: {
        items: current?.items ?? [],
        loading: true,
      },
    }));

    try {
      const resultsRef = collection(db, resultsCollection, code, "results");
      const snap = await getDocs(query(resultsRef, orderBy("createdAt", "desc")));
      const rawItems = snap.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }));
      const items = await Promise.all(
        rawItems
          .filter(
            (item): item is Record<string, unknown> & { uid: string } =>
              typeof item.uid === "string"
          )
          .map(async (item) => ({
            id: item.id as string,
            uid: item.uid,
            frame: typeof item.frame === "string" ? item.frame : "未設定",
            reward: typeof item.reward === "number" ? item.reward : 0,
            createdAt: item.createdAt as DateLike,
            userName: await getUserName(item.uid),
          }))
      );

      setPages((previous) => ({
        ...previous,
        [code]: {
          items,
          loading: false,
        },
      }));
    } catch (error) {
      console.error("ガチャ結果の読み込みに失敗しました", error);
      setPages((previous) => ({
        ...previous,
        [code]: {
          items: current?.items ?? [],
          loading: false,
          error: "結果の読み込みに失敗しました",
        },
      }));
    }
  };

  const toggleOpen = (code: string) => {
    const willOpen = !open[code];
    setOpen((previous) => ({ ...previous, [code]: willOpen }));
    if (willOpen && !pages[code]) {
      void loadResults(code);
    }
  };

  const pageTitle = archived ? "📚 ガチャアーカイブ" : "📜 ガチャ結果一覧";
  const currentUid = auth.currentUser?.uid;

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}>
      <h1 style={{ textAlign: "center", marginBottom: 20 }}>{pageTitle}</h1>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {archived ? (
          <Link href="/gacha/results" style={navigationLinkStyle}>
            現行ガチャの結果を見る
          </Link>
        ) : (
          <Link href="/gacha/archive" style={navigationLinkStyle}>
            ガチャアーカイブを見る
          </Link>
        )}
        {filterCode && !archived && (
          <Link href="/gacha/results" style={navigationLinkStyle}>
            他のガチャの結果を見る
          </Link>
        )}
      </div>

      <p style={{ marginBottom: 20, color: "#555", textAlign: "center" }}>
        ガチャタイトルは10件ずつ表示します。タイトルを開くと、そのガチャの結果を景品ごとに表示します。
      </p>

      {loading ? (
        <p>ガチャ一覧を読み込み中…</p>
      ) : gachas.length === 0 ? (
        <p>{archived ? "アーカイブされたガチャはありません。" : "結果があるガチャはありません。"}</p>
      ) : (
        gachas.map((gacha) => {
          const page = pages[gacha.id];
          const isOpen = open[gacha.id] ?? false;

          return (
            <section
              key={gacha.id}
              style={{
                background: "white",
                padding: 16,
                borderRadius: 12,
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                marginBottom: 20,
              }}
            >
              <button
                onClick={() => toggleOpen(gacha.id)}
                style={headerButtonStyle}
              >
                <span style={{ textAlign: "left" }}>
                  <strong style={{ display: "block", fontSize: 20 }}>
                    {gacha.title}
                  </strong>
                  <span style={{ color: "#555", fontSize: 14 }}>
                    {renderFlags(gacha.publicFlags)}
                  </span>
                </span>
                <span style={{ fontSize: 24 }}>{isOpen ? "▲" : "▼"}</span>
              </button>

              {gacha.thumbnail && (
                <div style={{ marginTop: 12, textAlign: "center" }}>
                  <img
                    src={gacha.thumbnail}
                    alt={`${gacha.title}のサムネイル`}
                    style={{
                      width: "100%",
                      maxWidth: 240,
                      borderRadius: 12,
                      boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                    }}
                  />
                </div>
              )}

              {isOpen && (
                <div style={{ marginTop: 16 }}>
                  {page?.loading && page.items.length === 0 ? (
                    <p>結果を読み込み中…</p>
                  ) : page?.items.length ? (
                    <>
                      {gacha.mode === "count" && gacha.totalCount !== null && (
                        <p
                          style={{
                            margin: "0 0 16px",
                            padding: "10px 12px",
                            color: "#312e81",
                            fontWeight: "bold",
                            background: "#eef2ff",
                            borderRadius: 8,
                          }}
                        >
                          抽選状況：{page.items.length} / {gacha.totalCount}
                        </p>
                      )}
                      {groupResultsByFrame(page.items, gacha.frames).map(
                        ([frame, results]) => (
                          <div
                            key={frame.label}
                            style={{
                              marginBottom: 16,
                              padding: 14,
                              background: "#f8fafc",
                              border: "1px solid #dbe3ef",
                              borderRadius: 10,
                            }}
                          >
                            <h3
                              style={{
                                margin: "0 0 10px",
                                paddingBottom: 10,
                                color: "#312e81",
                                borderBottom: "2px solid #c7d2fe",
                              }}
                            >
                              🎁 {frame.label}{" "}
                              <span style={{ fontSize: 14 }}>
                                （{results.length}
                                {gacha.mode === "count" && frame.maxCount !== null
                                  ? ` / ${frame.maxCount}`
                                  : "件"}
                                ）
                              </span>
                            </h3>
                            {results.length === 0 ? (
                              <p style={{ margin: 0, paddingLeft: 12 }}>当選者なし</p>
                            ) : (
                              <ul
                                style={{
                                  listStyle: "none",
                                  margin: 0,
                                  padding: "0 0 0 12px",
                                }}
                              >
                                {results.map((item) => (
                                  <li
                                    key={item.id}
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      gap: 12,
                                      marginBottom: 6,
                                      padding: "10px 12px",
                                      background: "white",
                                      border: "1px solid #e5e7eb",
                                      borderRadius: 6,
                                      color: currentUid === item.uid ? "#2563eb" : "#222",
                                      fontWeight: currentUid === item.uid ? "bold" : "normal",
                                    }}
                                  >
                                    <span>
                                      {item.userName}
                                      {currentUid === item.uid && " ← あなた"}
                                    </span>
                                    <span>{item.reward} pt</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )
                      )}
                    </>
                  ) : (
                    <p>結果がありません。</p>
                  )}

                  {page?.error && <p style={{ color: "#dc2626" }}>{page.error}</p>}
                </div>
              )}
            </section>
          );
        })
      )}

      {!loading && hasMoreCodes && (
        <button
          onClick={() => void loadMoreGachas()}
          disabled={loadingMoreCodes}
          style={loadMoreButtonStyle}
        >
          {loadingMoreCodes ? "読み込み中…" : "さらに10件のガチャを表示"}
        </button>
      )}
    </div>
  );
}

function renderFlags(flags: string[]) {
  return flags.length
    ? flags.map((flag) => flagLabels[flag] ?? flag).join(" / ")
    : "（未設定）";
}

function toGachaCode(document: QueryDocumentSnapshot<DocumentData>): GachaCode {
  const data = document.data();
  return {
    id: document.id,
    title: typeof data.title === "string" ? data.title : "名称未設定",
    publicFlags: Array.isArray(data.publicFlags) ? data.publicFlags : [],
    thumbnail: typeof data.thumbnail === "string" ? data.thumbnail : "",
    frames: Array.isArray(data.frames)
      ? data.frames
          .map((frame) =>
            typeof frame === "object" &&
            frame !== null &&
            typeof (frame as { label?: unknown }).label === "string"
              ? {
                  label: (frame as { label: string }).label,
                  maxCount:
                    typeof (frame as { maxCount?: unknown }).maxCount === "number"
                      ? (frame as { maxCount: number }).maxCount
                      : null,
                }
              : null
          )
          .filter((frame): frame is GachaFrame => frame !== null)
      : [],
    mode: data.mode === "count" ? "count" : "probability",
    totalCount: typeof data.totalCount === "number" ? data.totalCount : null,
    createdAt: data.createdAt as DateLike,
  };
}

function groupResultsByFrame(items: GachaResult[], frames: GachaFrame[]) {
  const groups = new Map<string, { frame: GachaFrame; results: GachaResult[] }>();
  for (const frame of frames) {
    groups.set(frame.label, { frame, results: [] });
  }
  for (const item of items) {
    const group = groups.get(item.frame) ?? {
      frame: { label: item.frame, maxCount: null },
      results: [],
    };
    group.results.push(item);
    groups.set(item.frame, group);
  }
  return [...groups.values()].map(({ frame, results }) => [frame, results] as const);
}

const navigationLinkStyle = {
  flex: 1,
  padding: "10px 16px",
  color: "white",
  textAlign: "center" as const,
  textDecoration: "none",
  background: "#4f46e5",
  borderRadius: 6,
};

const headerButtonStyle = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: 0,
  cursor: "pointer",
  textAlign: "left" as const,
  background: "none",
  border: "none",
};

const loadMoreButtonStyle = {
  width: "100%",
  marginTop: 16,
  padding: "10px 16px",
  color: "white",
  fontWeight: "bold",
  background: "#2563eb",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};
