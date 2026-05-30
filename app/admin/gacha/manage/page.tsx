"use client";

import { useEffect, useState } from "react";
import { db, functions } from "@/firebase";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  updateDoc,
  where,
  getDoc,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

export default function GachaManagePage() {
  const [codes, setCodes] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const loadCodes = async () => {
    const q = query(
      collection(db, "gachaCodes"),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setCodes(list);
  };

  const searchCode = async () => {
    if (!search.trim()) return loadCodes();

    const q = query(
      collection(db, "gachaCodes"),
      where("title", "==", search.trim())
    );

    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setCodes(list);
  };

  /* --------------------------------------------------
     ★ ガチャ削除（サブコレクションの結果も削除）
  -------------------------------------------------- */
  const deleteCode = async (id: string) => {
    if (!confirm("本当に削除しますか？")) return;

    await deleteDoc(doc(db, "gachaCodes", id));

    const resultsRef = collection(db, "gachaResults", id, "results");
    const snap = await getDocs(resultsRef);

    const batch = writeBatch(db);
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    alert("ガチャと結果を削除しました");
    await loadCodes();
  };

  /* --------------------------------------------------
     ★ アーカイブへ移動
  -------------------------------------------------- */
  const archiveCode = async (id: string) => {
    if (!confirm("このガチャをアーカイブへ移動しますか？")) return;

    const ref = doc(db, "gachaCodes", id);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      alert("データが見つかりません");
      return;
    }

    const data = snap.data();

    await setDoc(doc(db, "gachaCodesArchive", id), {
      ...data,
      archivedAt: new Date(),
    });

    await deleteDoc(ref);

    const srcRef = collection(db, "gachaResults", id, "results");
    const srcSnap = await getDocs(srcRef);

    const batch = writeBatch(db);

    srcSnap.forEach((docSnap) => {
      const resultData = docSnap.data();
      const resultId = docSnap.id;

      const dstRef = doc(
        db,
        "gachaResultsArchive",
        id,
        "results",
        resultId
      );

      batch.set(dstRef, {
        ...resultData,
        archivedAt: new Date(),
      });

      batch.delete(docSnap.ref);
    });

    await batch.commit();

    alert("ガチャと結果をアーカイブへ移動しました");
    await loadCodes();
  };

  /* -----------------------------------------
     ★ 再発行＝内容変更
  ----------------------------------------- */
  const updateGacha = async (codeData: any) => {
    if (!confirm("このガチャの内容を更新しますか？")) return;

    await updateDoc(doc(db, "gachaCodes", codeData.id), {
      title: codeData.title,
      frames: codeData.frames,
      totalCount: codeData.totalCount,
      mode: codeData.mode,
      resetType: codeData.resetType,
      publicFlags: codeData.publicFlags,
      point: codeData.point,
      thumbnail: codeData.thumbnail,
      expiresAt: codeData.expiresAt,
      xAccountList: codeData.xAccountList ?? [],
    });

    alert("ガチャ内容を更新しました");
    await loadCodes();
  };

  const updateTitle = async (id: string, newTitle: string) => {
    await updateDoc(doc(db, "gachaCodes", id), { title: newTitle });
    await loadCodes();
  };

  const updateExpire = async (id: string, newDate: string) => {
    const expiresAt = new Date(newDate);
    await updateDoc(doc(db, "gachaCodes", id), { expiresAt });
    await loadCodes();
  };

  const updatePublicFlags = async (id: string, newFlags: string[]) => {
    await updateDoc(doc(db, "gachaCodes", id), {
      publicFlags: newFlags,
      public: null,
    });
    await loadCodes();
  };

  const getUserInfo = async (uid: string) => {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return { label: uid };

    const data = snap.data();
    const displayName = data.displayName ?? "";
    const x = data.xAccount ?? "";

    let label = "";
    if (displayName && x) label = `${displayName}（${x}）`;
    else if (displayName) label = displayName;
    else if (x) label = x;
    else label = uid;

    return { label };
  };

  const getResultsByCode = async (code: string) => {
    const snap = await getDocs(
      collection(db, "gachaResults", code, "results")
    );

    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
  };

  useEffect(() => {
    loadCodes();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>🎛 ガチャ管理（ガチャ別）</h1>

      <div style={{ marginBottom: 20 }}>
        <input
          type="text"
          placeholder="タイトル検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: 10,
            border: "1px solid #ccc",
            borderRadius: 6,
            marginRight: 10,
          }}
        />
        <button
          onClick={searchCode}
          style={{
            padding: "10px 16px",
            background: "#2563eb",
            color: "white",
            borderRadius: 6,
            border: "none",
          }}
        >
          検索
        </button>
      </div>

      {codes
        .filter((c) => c.point)
        .map((c) => (
          <GachaItem
            key={c.id}
            codeData={c}
            getUserInfo={getUserInfo}
            getResultsByCode={getResultsByCode}
            updateTitle={updateTitle}
            updateExpire={updateExpire}
            updatePublicFlags={updatePublicFlags}
            updateGacha={updateGacha}
            deleteCode={deleteCode}
            archiveCode={archiveCode}
          />
        ))}
    </div>
  );
}
/* ------------------------------
   ガチャ1件分の表示
------------------------------ */
function GachaItem({
  codeData,
  getUserInfo,
  getResultsByCode,
  updateTitle,
  updateExpire,
  updatePublicFlags,
  updateGacha,
  deleteCode,
  archiveCode,
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [showX, setShowX] = useState(false);

  const toggle = async () => {
    setOpen(!open);
    if (!open) {
      setLoading(true);
      const r = await getResultsByCode(codeData.code);
      setResults(r);
      setLoading(false);
    }
  };

  /* -----------------------------------------
     ★ Xアカウント対象編集
  ----------------------------------------- */
  const [editXList, setEditXList] = useState(false);
  const [xListText, setXListText] = useState("");

  const openXEditor = () => {
    const list = codeData.xAccountList ?? [];
    setXListText(list.join("\n"));
    setEditXList(true);
  };

  const saveXList = async () => {
    const newList = xListText
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    await updateDoc(doc(db, "gachaCodes", codeData.id), {
      xAccountList: newList,
    });

    alert("Xアカウント対象リストを更新しました");
    setEditXList(false);
  };

  const remaining =
    codeData.mode === "count"
      ? codeData.totalCount - results.length
      : "∞";

  const resetUsage = async () => {
    if (!confirm("このガチャの全ユーザーの使用回数をリセットしますか？")) return;

    const fn = httpsCallable(functions, "resetGachaUsage");
    const res: any = await fn({ code: codeData.code });

    alert(`リセット完了：${res.data.count} 件の履歴を更新しました`);
  };

  const renderFlags = (flags: string[] = []) => {
    const map: Record<string, string> = {
      public: "🌐 公開",
      limited: "🔒 限定",
      subscriber: "⭐ サブスク限定",
      nibuichi_winner: "🎯 的中者限定",
      x_account_match: "📝 Xアカウント一致",
    };
    if (flags.length === 0) return "（未設定）";
    return flags.map((f) => map[f] ?? f).join(" / ");
  };

  return (
    <div> {/* ← ★外側の div（構文エラー修正） */}
      <div
        style={{
          border: "1px solid #ccc",
          padding: 16,
          borderRadius: 8,
          marginBottom: 24,
        }}
      >
        {/* タイトル + 削除 + アーカイブ */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2
            onClick={toggle}
            style={{ cursor: "pointer", color: "#2563eb", margin: 0 }}
          >
            {codeData.title}
          </h2>

          <div>
            <button
              onClick={() => archiveCode(codeData.id)}
              style={btnGraySmall}
            >
              アーカイブ
            </button>

            <button
              onClick={() => deleteCode(codeData.id)}
              style={btnRedSmall}
            >
              削除
            </button>
          </div>
        </div>

        <p>コード：{codeData.code}</p>
        <p>方式：{codeData.mode === "count" ? "枠数方式" : "確率方式"}</p>
        <p>
          1回 {codeData.point.cost} pt（上限 {codeData.point.maxPerUser} 回）
        </p>

        <p>残数：{remaining}</p>

        <p>公開設定：{renderFlags(codeData.publicFlags)}</p>

        {/* ★ Xアカウント折りたたみ */}
        {codeData.publicFlags?.includes("x_account_match") && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              background: "#f9fafb",
              border: "1px solid #eee",
              borderRadius: 6,
            }}
          >
            <strong>対象Xアカウント</strong>

            <button
              onClick={() => setShowX((prev) => !prev)}
              style={{
                marginTop: 6,
                padding: "4px 8px",
                background: "#2563eb",
                color: "white",
                borderRadius: 4,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {showX ? "▲ 閉じる" : "▼ 表示する"}
            </button>

            {showX && (
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  marginTop: 6,
                  fontSize: 13,
                  background: "#fff",
                  padding: 8,
                  borderRadius: 4,
                  border: "1px solid #ddd",
                }}
              >
                {(codeData.xAccountList ?? []).join("\n")}
              </pre>
            )}

            <button
              onClick={openXEditor}
              style={{
                marginTop: 8,
                padding: "6px 10px",
                background: "#4f46e5",
                color: "white",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Xアカウント対象を編集
            </button>

            {editXList && (
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  background: "#fff",
                  borderRadius: 6,
                  border: "1px solid #ddd",
                }}
              >
                <textarea
                  value={xListText}
                  onChange={(e) => setXListText(e.target.value)}
                  style={{
                    width: "100%",
                    height: "120px",
                    padding: 10,
                    borderRadius: 6,
                    border: "1px solid #ccc",
                    fontSize: 14,
                    whiteSpace: "pre",
                  }}
                />

                <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                  <button
                    onClick={saveXList}
                    style={{
                      padding: "6px 12px",
                      background: "#2563eb",
                      color: "white",
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    保存
                  </button>

                  <button
                    onClick={() => setEditXList(false)}
                    style={{
                      padding: "6px 12px",
                      background: "#6b7280",
                      color: "white",
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 公開設定の編集 */}
        <div style={{ marginBottom: 12 }}>
          {["public", "limited", "subscriber", "nibuichi_winner", "x_account_match"].map((flag) => (
            <label key={flag} style={{ marginRight: 12 }}>
              <input
                type="checkbox"
                checked={codeData.publicFlags?.includes(flag)}
                onChange={(e) => {
                  const flags = new Set(codeData.publicFlags ?? []);
                  e.target.checked ? flags.add(flag) : flags.delete(flag);
                  updatePublicFlags(codeData.id, Array.from(flags));
                }}
              />
              {renderFlags([flag])}
            </label>
          ))}
        </div>

        <button
          onClick={resetUsage}
          style={{
            padding: "6px 12px",
            background: "#dc2626",
            color: "white",
            borderRadius: 6,
            border: "none",
            marginBottom: 12,
            cursor: "pointer",
          }}
        >
          使用回数をリセット
        </button>

        {open && (
          <div style={{ marginTop: 16 }}>
            <p>作成日：{codeData.createdAt.toDate().toLocaleString()}</p>
            <p>締切日：{codeData.expiresAt.toDate().toLocaleString()}</p>

            <label>期限を変更：</label>
            <input
              type="datetime-local"
              onChange={(e) => updateExpire(codeData.id, e.target.value)}
              style={{
                padding: 6,
                border: "1px solid #ccc",
                borderRadius: 6,
                marginBottom: 12,
                display: "block",
              }}
            />

            <label>タイトル編集：</label>
            <input
              type="text"
              defaultValue={codeData.title}
              onBlur={(e) => updateTitle(codeData.id, e.target.value)}
              style={{
                padding: 6,
                border: "1px solid #ccc",
                borderRadius: 6,
                marginBottom: 12,
                display: "block",
              }}
            />

            <hr />

            {loading ? (
              <p>読み込み中…</p>
            ) : (
              <FrameList
                frames={codeData.frames}
                results={results}
                getUserInfo={getUserInfo}
                mode={codeData.mode}
              />
            )}

            <hr style={{ margin: "16px 0" }} />

            <button
              onClick={() => navigator.clipboard.writeText(codeData.code)}
              style={btnBlue}
            >
              コピー
            </button>

            <button
              onClick={() => updateGacha(codeData)}
              style={btnGreen}
            >
              内容を更新
            </button>

            <button
              onClick={() => archiveCode(codeData.id)}
              style={btnGray}
            >
              アーカイブへ移動
            </button>

            <button
              onClick={() => deleteCode(codeData.id)}
              style={btnRed}
            >
              削除
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------
   枠ごとの当選者一覧（★重複バグ完全修正版）
------------------------------ */
function FrameList({ frames, results, getUserInfo, mode }) {
  return (
    <div>
      {frames.map((f: any, i: number) => {
        // ★ frameName と一致するキーを自動判定（label / name 混在対策）
        const frameKey =
          results.some((r: any) => r.frameName === f.label)
            ? f.label
            : results.some((r: any) => r.frameName === f.name)
            ? f.name
            : null;

        const filtered = frameKey
          ? results.filter((r: any) => r.frameName === frameKey)
          : [];

        const frameResults = Array.from(
          new Map(filtered.map((r: any) => [r.id, r])).values()
        ).sort((a: any, b: any) => a.reward - b.reward);

        return (
          <div key={i} style={{ marginBottom: 20 }}>
            <h3>
              {f.label || f.name}（
              {mode === "count"
                ? `${frameResults.length}/${f.maxCount}`
                : `${Math.round(f.probability * 100)}%`}
              ）
            </h3>

            {frameResults.length === 0 ? (
              <p style={{ marginLeft: 20 }}>当選者なし</p>
            ) : (
              <ul style={{ paddingLeft: 20 }}>
                {frameResults.map((r: any) => (
                  <UserResultItem
                    key={r.id}
                    result={r}
                    getUserInfo={getUserInfo}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------
   当選者の表示
------------------------------ */
function UserResultItem({ result, getUserInfo }) {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const data = await getUserInfo(result.uid);
      setUser(data);
    };
    load();
  }, []);

  if (!user) return <li>読み込み中…</li>;

  return (
    <li style={{ marginBottom: 4 }}>
      {user.label}　報酬Pt {result.reward}
    </li>
  );
}

/* ------------------------------
   ボタンスタイル
------------------------------ */
const btnBlue = {
  marginRight: 10,
  padding: "6px 12px",
  background: "#2563eb",
  color: "white",
  borderRadius: 6,
  border: "none",
};

const btnGreen = {
  marginRight: 10,
  padding: "6px 12px",
  background: "#10b981",
  color: "white",
  borderRadius: 6,
  border: "none",
};

const btnRed = {
  padding: "6px 12px",
  background: "#dc2626",
  color: "white",
  borderRadius: 6,
  border: "none",
};

const btnRedSmall = {
  padding: "4px 10px",
  background: "#dc2626",
  color: "white",
  borderRadius: 6,
  border: "none",
  fontSize: 14,
  cursor: "pointer",
};

const btnGray = {
  padding: "6px 12px",
  background: "#6b7280",
  color: "white",
  borderRadius: 6,
  border: "none",
};

const btnGraySmall = {
  padding: "4px 10px",
  background: "#6b7280",
  color: "white",
  borderRadius: 6,
  border: "none",
  fontSize: 14,
  cursor: "pointer",
};
