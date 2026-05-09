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

  const deleteCode = async (id: string) => {
    if (!confirm("本当に削除しますか？")) return;
    await deleteDoc(doc(db, "gachaCodes", id));
    await loadCodes();
  };

  const recreateCode = async (frames: any[], title: string, totalCount: number) => {
    const fn = httpsCallable(functions, "createGachaCode");
    const res: any = await fn({ frames, title, totalCount });
    alert(`新しいコードを発行しました：${res.data.code}`);
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

  const updatePublic = async (id: string, value: boolean) => {
    await updateDoc(doc(db, "gachaCodes", id), { public: value });
    await loadCodes();
  };

  const getUserInfo = async (uid: string) => {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) {
      return { label: uid };
    }

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
    const fn = httpsCallable(functions, "getGachaResults");
    const res: any = await fn();
    return res.data.filter((r: any) => r.code === code);
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
            updatePublic={updatePublic}
            recreateCode={recreateCode}
            deleteCode={deleteCode}
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
  updatePublic,
  recreateCode,
  deleteCode,
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setOpen(!open);
    if (!open) {
      setLoading(true);
      const r = await getResultsByCode(codeData.code);
      setResults(r);
      setLoading(false);
    }
  };

  const remaining =
    codeData.mode === "count"
      ? codeData.totalCount -
        codeData.frames.reduce((a: number, f: any) => a + f.usedCount, 0)
      : "∞";

  return (
    <div
      style={{
        border: "1px solid #ccc",
        padding: 16,
        borderRadius: 8,
        marginBottom: 24,
      }}
    >

      {/* タイトル + 削除ボタン */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2
          onClick={toggle}
          style={{ cursor: "pointer", color: "#2563eb", margin: 0 }}
        >
          {codeData.title}
        </h2>

        <button
          onClick={() => deleteCode(codeData.id)}
          style={btnRedSmall}
        >
          削除
        </button>
      </div>

      <p>コード：{codeData.code}</p>
      <p>方式：{codeData.mode === "count" ? "枠数方式" : "確率方式"}</p>
      <p>
        1回 {codeData.point.cost} pt（上限 {codeData.point.maxPerUser} 回）
      </p>
      <p>残数：{remaining}</p>

      <p>
        公開設定：
        {codeData.public ? (
          <span style={{ color: "#10b981", fontWeight: "bold" }}>公開</span>
        ) : (
          <span style={{ color: "#6b7280", fontWeight: "bold" }}>限定</span>
        )}
      </p>

      <button
        onClick={() => updatePublic(codeData.id, !codeData.public)}
        style={btnToggle}
      >
        {codeData.public ? "限定にする" : "公開にする"}
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
            onClick={() =>
              recreateCode(codeData.frames, codeData.title, codeData.totalCount)
            }
            style={btnGreen}
          >
            再発行
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
  );
}

/* ------------------------------
   枠ごとの当選者一覧
------------------------------ */
function FrameList({ frames, results, getUserInfo, mode }) {
  return (
    <div>
      {frames.map((f: any, i: number) => {
        const frameResults = results
          .filter(
            (r: any) =>
              r.frameName === f.label || r.frameName === f.name
          )
          .sort((a: any, b: any) => a.reward - b.reward);

        return (
          <div key={i} style={{ marginBottom: 20 }}>
            <h3>
              {f.label || f.name}（
              {mode === "count"
                ? `${f.usedCount}/${f.maxCount}`
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

const btnToggle = {
  marginBottom: 12,
  padding: "6px 12px",
  background: "#6b7280",
  color: "white",
  borderRadius: 6,
  border: "none",
  cursor: "pointer",
};
