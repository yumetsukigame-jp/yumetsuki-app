"use client";

import type { DocumentData } from "firebase/firestore";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db, functions, storage } from "@/firebase";
import { httpsCallable } from "firebase/functions";
import {
  doc,
  getDoc,
  deleteDoc,
} from "firebase/firestore";
import { ref, uploadBytesResumable, deleteObject } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import {
  IMAGE_FOLDER_OPTIONS,
  normalizeImageFolder,
} from "@/app/lib/imageFolders";

export default function ImageDetailPage() {
  const { id } = useParams();
  const router = useRouter();

  const [data, setData] = useState<DocumentData | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [folder, setFolder] = useState("");
  const [prefix, setPrefix] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);

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
    setFolder(normalizeImageFolder(d.folder));
    setPrefix(d.prefix || "");
    setLoading(false);
  };

  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);

  const handleMove = async () => {
    if (!data || data.folder === folder) return;
    if (!confirm("この画像を選択したフォルダへ移動しますか？")) return;

    setMoving(true);
    try {
      const moveImage = httpsCallable<
        { imageId: string; targetFolder: string },
        { path: string; url: string }
      >(functions, "moveImage");
      const result = await moveImage({
        imageId: id as string,
        targetFolder: folder,
      });

      setData((current) =>
        current
          ? {
              ...current,
              folder,
              path: result.data.path,
              url: result.data.url,
            }
          : current
      );
      alert("フォルダを移動しました");
    } catch (error) {
      console.error("move image error:", error);
      alert("フォルダの移動に失敗しました");
    } finally {
      setMoving(false);
    }
  };

  // 差し替え処理
  const handleReplace = async () => {
    if (!newFile || !data) {
      alert("新しい画像を選択してください");
      return;
    }
    const currentData = data;

    setSaving(true);

    // ① 新しい画像を rawUploads にアップロード
    const uploadId = uuidv4();
    const storageRef = ref(storage, `rawUploads/admin/${uploadId}`);

    // ★ metadata は直下に入れる（新 Storage 仕様）
    const metadata = {
      customMetadata: {
        folder: folder || "",
        prefix: prefix || "",
        originalName: newFile.name,
      },
    };

    const task = uploadBytesResumable(storageRef, newFile, metadata);

    task.on(
      "state_changed",
      () => {},
      (err) => {
        console.error("upload error:", err);
        alert("アップロードに失敗しました");
        setSaving(false);
      },
      async () => {
        alert("新しい画像を処理中…（数秒〜数十秒）");

        // ③ 古い画像を削除
        try {
          await deleteObject(ref(storage, currentData.path));
        } catch (e) {
          console.error("delete old image error:", e);
        }

        // ④ Firestore の古いメタ情報を削除
        try {
          await deleteDoc(doc(db, "imageMeta", id as string));
        } catch (e) {
          console.error("delete meta error:", e);
        }

        alert("差し替えが完了しました");
        router.push("/admin/images");
      }
    );
  };

  if (loading || !data) return <p>読み込み中…</p>;

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>
      <h1>🖼 画像編集</h1>

      {/* 現在の画像 */}
      <div style={{ marginBottom: 20 }}>
        <img
          src={data.url}
          style={{ width: "100%", borderRadius: 8, marginBottom: 10 }}
        />
        <p><strong>filename:</strong> {data.fileName}</p>
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
          {IMAGE_FOLDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleMove}
          disabled={moving || data.folder === folder}
          style={{
            marginLeft: 10,
            padding: "8px 12px",
            background: data.folder === folder ? "#9ca3af" : "#059669",
            color: "white",
            borderRadius: 6,
            border: "none",
            cursor:
              moving || data.folder === folder ? "not-allowed" : "pointer",
          }}
        >
          {moving ? "移動中…" : "フォルダ変更を保存"}
        </button>
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
