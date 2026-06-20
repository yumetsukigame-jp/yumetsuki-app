"use client";

import { useEffect, useState } from "react";
import { db } from "../../../../firebase";
import { doc, setDoc, collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";

// 日本語を含む名前から英数字だけのIDを生成する関数
function generateIdFromName(name: string) {
  return name
    .normalize("NFKD")              // 全角 → 半角
    .replace(/[^\w]/g, "")          // 英数字と _ 以外を削除
    .toLowerCase();                 // 小文字化
}

export default function AddRewardForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [cost, setCost] = useState(0);
  const [stock, setStock] = useState(0);
  const [image, setImage] = useState("");
  const [images, setImages] = useState<any[]>([]);

  // Firestore から rewards フォルダの画像一覧を取得
  useEffect(() => {
    const load = async () => {
      const snap = await getDocs(collection(db, "imageMeta"));
      const list = snap.docs
        .map((d) => d.data())
        .filter((d) => d.folder === "rewards");

      setImages(list);
    };

    load();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();

    if (!name || !image) {
      alert("名前と画像を選択してください");
      return;
    }

    // 日本語名 → 英数字IDへ変換
    const id = generateIdFromName(name);

    if (!id) {
      alert("英数字のIDを生成できませんでした。別の名前を試してください。");
      return;
    }

    await setDoc(doc(db, "rewards", id), {
      name,
      cost: Number(cost),
      stock: Number(stock),
      image,
    });

    alert("追加しました！");
    router.push("/admin/rewards");
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>
        発送物を追加
      </h1>

      <form
        onSubmit={handleSave}
        style={{ display: "flex", flexDirection: "column", gap: "16px" }}
      >
        <div>
          <label>名前（日本語OK）</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%", padding: "8px", border: "1px solid #ccc" }}
          />
        </div>

        <div>
          <label>必要ポイント</label>
          <input
            type="number"
            value={cost}
            onChange={(e) => setCost(Number(e.target.value))}
            style={{ width: "100%", padding: "8px", border: "1px solid #ccc" }}
          />
        </div>

        <div>
          <label>在庫数</label>
          <input
            type="number"
            value={stock}
            onChange={(e) => setStock(Number(e.target.value))}
            style={{ width: "100%", padding: "8px", border: "1px solid #ccc" }}
          />
        </div>

        <div>
          <label>画像を選択</label>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              marginTop: "10px",
            }}
          >
            {images.map((img) => (
              <div
                key={img.url}
                onClick={() => setImage(img.url)}
                style={{
                  border:
                    image === img.url
                      ? "3px solid #4f46e5"
                      : "1px solid #ccc",
                  padding: "5px",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                <img
                  src={img.url}
                  alt={img.prefix}
                  width={100}
                  style={{ borderRadius: "6px" }}
                />
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          style={{
            padding: "12px",
            background: "#4f46e5",
            color: "white",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
          }}
        >
          追加する
        </button>
      </form>
    </div>
  );
}
