"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db, storage } from "@/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { ref, uploadBytesResumable, deleteObject } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";

export default function ImageDetailPage() {
  const { id } = useParams();
  const router = useRouter();

  const [data, setData] = useState<any>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [folder, setFolder] = useState("");
  const [prefix, setPrefix] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  // 画像メタ情報を取得
  const load = async () => {
    const snap = await getDoc(doc(db, "imageMeta", id as string));
    if (!snap.exists()) {
      alert("データが存在しません");
      router.push("/admin/images");
      return;
    }

    const d = snap.data();
    setData(d);
    setFolder(d.folder);
    setPrefix(d.prefix || "");
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // 差し替え処理
  const handleReplace = async () => {
    if (!newFile) {
      alert("新しい画像を選択してください");
      return;
    }

    setSaving(true);

    // ① 新しい画像を rawUploads にアップロード
    const uploadId = uuidv4();
    const storageRef = ref(storage, `rawUploads/admin/${uploadId}`);

    // ★ customMetadata をやめて metadata 直下に入れる（スマホ対策）
    const metadata = {
      folder,
      prefix,
      originalName: newFile.name,
    };

    const task = uploadBytesResumable(storageRef, newFile, metadata);

    task.on(
      "state_changed",
      () => {},
      (err) => {
        console.error(err);
        alert("アップロードに失敗しました");
        setSaving(false);
      },
      async () => {
        // ② Functions が処理するので少し待つ
        alert("新しい画像を処理中…（数秒〜数十秒）");

        // ③ 古い画像を削除
        await deleteObject(ref(storage, data.path));

        // ④ Firestore の古いメタ情報を削除
        await deleteDoc(doc(db, "imageMeta", id as string));

        alert("差し替えが完了しました");
        router.push("/admin/images");
      }
    );
  };

  if (loading) return <p>読み込み中…</p>;

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>
      <h1>🖼 画像差し替え</h1>

      {/* 現在の画像 */}
      <div style={{ marginBottom: 20 }}>
        <img
          src={data.url}
          style={{ width: "100%", borderRadius: 8, marginBottom: 10 }}
        />
        <p><strong>filename:</strong> {data.filename}</p>
        <p><strong>prefix:</strong> {data.prefix || "(なし)"}</p>
        <p><strong>folder:</strong> {data.folder}</p>
        <p><strong>path:</strong> {data.path}</p>

        {data.usedBy?.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <p><strong>使用中：</strong></p>
            <ul>
              {data.usedBy.map((u: string) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 新しい画像の設定 */}
      <div style={{ marginBottom: 20 }}>
        <label>新しいフォルダ：</label>
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
        <label>新しい prefix：</label>
        <input
          type="text"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          style={{ padding: 8, marginLeft: 10 }}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label>新しい画像：</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <button
        onClick={handleReplace}
        disabled={saving}
        style={{
          padding: "10px 20px",
          background: "#4f46e5",
          color: "white",
          borderRadius: 8,
          border: "none",
          cursor: "pointer",
        }}
      >
        {saving ? "処理中…" : "差し替えを実行"}
      </button>
    </div>
  );
}
