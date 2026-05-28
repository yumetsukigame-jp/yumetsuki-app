"use client";

import { useEffect, useState } from "react";
import { auth, storage, db } from "@/firebase";
import { ref, uploadBytesResumable } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import { v4 as uuidv4 } from "uuid";
import { collection, getDocs } from "firebase/firestore";

export default function ImageUploadPage() {
  /* ------------------------------
     Auth 状態
  ------------------------------ */
  const [uid, setUid] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  /* ------------------------------
     UI 状態
  ------------------------------ */
  const [file, setFile] = useState<File | null>(null);
  const [folder, setFolder] = useState("gacha");

  // prefix 関連
  const [prefix, setPrefix] = useState("none");
  const [customPrefix, setCustomPrefix] = useState("");

  // ファイル名（任意入力）
  const [customFileName, setCustomFileName] = useState("");

  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const folders = [
    "gacha",
    "banners",
    "icons",
    "questicon",
    "character-select",
    "rewards",
    "memories",
    "misc",
  ];

  const prefixes = [
    { value: "none", label: "なし" },
    { value: "orica_", label: "orica_" },
    { value: "week_", label: "week_" },
    { value: "sp_", label: "sp_" },
    { value: "custom", label: "カスタム入力" },
  ];

  /* ------------------------------
     アップロード処理
  ------------------------------ */
  const handleUpload = async () => {
    if (!file) return setMessage("ファイルを選択してください");
    if (!uid) return setMessage("ログインが必要です");

    setUploading(true);
    setMessage("");

    const uploadId = uuidv4();

    // Functions が監視しているパス
    const storageRef = ref(storage, `rawUploads/admin/${uploadId}`);

    // prefix の決定
    const finalPrefix =
      prefix === "custom" ? customPrefix : prefix === "none" ? "" : prefix;

    // ★ metadata（新仕様：customMetadata ではなく直下）
    const metadata = {
      folder,
      prefix: finalPrefix,
      originalName: customFileName || file.name,
    };

    const task = uploadBytesResumable(storageRef, file, metadata);

    task.on(
      "state_changed",
      () => {},
      () => {
        setMessage("アップロードに失敗しました");
        setUploading(false);
      },
      async () => {
        setMessage("アップロード完了！画像処理中…");
        setUploading(false);

        /* ---------------------------------------------------------
           ★ Firestore の imageMeta が作られるまで待つ（ポーリング）
           --------------------------------------------------------- */
        const targetName = customFileName || file.name;

        const interval = setInterval(async () => {
          const snap = await getDocs(collection(db, "imageMeta"));
          const found = snap.docs.find((d) => {
            const data = d.data();
            return data.originalName === targetName;
          });

          if (found) {
            clearInterval(interval);
            setMessage("画像処理が完了しました！");
          }
        }, 1500);
      }
    );
  };

  /* ------------------------------
     Auth 初期化前
  ------------------------------ */
  if (!authReady) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        読み込み中…
      </div>
    );
  }

  /* ------------------------------
     未ログイン
  ------------------------------ */
  if (!uid) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        ログインが必要です
      </div>
    );
  }

  /* ------------------------------
     JSX
  ------------------------------ */
  return (
    <div style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 20 }}>📤 画像アップロード</h1>

      {/* フォルダ選択 */}
      <div style={{ marginBottom: 20 }}>
        <label>フォルダ：</label>
        <select
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          style={{ padding: 8, marginLeft: 10 }}
        >
          {folders.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </div>

      {/* prefix 選択 */}
      <div style={{ marginBottom: 20 }}>
        <label>prefix：</label>
        <select
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          style={{ padding: 8, marginLeft: 10 }}
        >
          {prefixes.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        {/* カスタム prefix 入力 */}
        {prefix === "custom" && (
          <input
            type="text"
            placeholder="カスタム prefix"
            value={customPrefix}
            onChange={(e) => setCustomPrefix(e.target.value)}
            style={{
              padding: 8,
              marginLeft: 10,
              border: "1px solid #ccc",
              borderRadius: 6,
            }}
          />
        )}
      </div>

      {/* ファイル名（任意） */}
      <div style={{ marginBottom: 20 }}>
        <label>ファイル名（任意）：</label>
        <input
          type="text"
          placeholder="例：my_banner.png"
          value={customFileName}
          onChange={(e) => setCustomFileName(e.target.value)}
          style={{
            padding: 8,
            marginLeft: 10,
            border: "1px solid #ccc",
            borderRadius: 6,
          }}
        />
      </div>

      {/* ファイル選択 */}
      <div style={{ marginBottom: 20 }}>
        <label
          style={{
            display: "inline-block",
            padding: "10px 20px",
            background: "#4f46e5",
            color: "white",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          ファイルを選択
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {file && (
          <span style={{ marginLeft: 12 }}>
            選択中：{file.name}
          </span>
        )}
      </div>

      {/* アップロードボタン */}
      <button
        onClick={handleUpload}
        disabled={uploading}
        style={{
          marginTop: 20,
          padding: "10px 20px",
          background: "#2563eb",
          color: "white",
          borderRadius: 8,
          cursor: uploading ? "not-allowed" : "pointer",
        }}
      >
        {uploading ? "アップロード中…" : "アップロード"}
      </button>

      {message && <p style={{ marginTop: 20 }}>{message}</p>}
    </div>
  );
}
