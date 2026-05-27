"use client";

import { useState } from "react";
import { auth, storage } from "@/firebase";
import { ref, uploadBytesResumable } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";

export default function ImageUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [folder, setFolder] = useState("gacha");
  const [prefix, setPrefix] = useState("");
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

  const handleUpload = async () => {
    if (!file) return setMessage("ファイルを選択してください");

    const uid = auth.currentUser?.uid;
    if (!uid) return setMessage("ログインが必要です");

    setUploading(true);
    setMessage("");

    const uploadId = uuidv4();
    const storageRef = ref(storage, `rawUploads/${uid}/${uploadId}`);

    const metadata = {
      customMetadata: {
        folder,
        prefix,
        originalName: file.name,
      },
    };

    const task = uploadBytesResumable(storageRef, file, metadata);

    task.on(
      "state_changed",
      () => {},
      () => {
        setMessage("アップロードに失敗しました");
        setUploading(false);
      },
      () => {
        setMessage("アップロード完了！画像処理中…");
        setUploading(false);
      }
    );
  };

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>
      <h1>📤 画像アップロード</h1>

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

      <div style={{ marginBottom: 20 }}>
        <label>prefix：</label>
        <input
          type="text"
          placeholder="例：orica_ / week_ / sp_"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          style={{ padding: 8, marginLeft: 10 }}
        />
      </div>

      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <button
        onClick={handleUpload}
        disabled={uploading}
        style={{
          marginTop: 20,
          padding: "10px 20px",
          background: "#2563eb",
          color: "white",
          borderRadius: 8,
        }}
      >
        {uploading ? "アップロード中…" : "アップロード"}
      </button>

      {message && <p style={{ marginTop: 20 }}>{message}</p>}
    </div>
  );
}
