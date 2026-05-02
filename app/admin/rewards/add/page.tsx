"use client";

import { useState } from "react";
import { db } from "../../../../firebase";
import { collection, addDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function AddRewardPage() {
  const [name, setName] = useState("");
  const [cost, setCost] = useState<number>(0);
  const [image, setImage] = useState("");
  const [stock, setStock] = useState<number>(0);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !image) {
      alert("名前と画像パスは必須です");
      return;
    }

    await addDoc(collection(db, "rewards"), {
      name,
      cost,
      image,
      stock,
      createdAt: new Date(),
    });

    alert("発送物を追加しました！");
    router.push("/admin/rewards");
  };

  return (
    <div style={{ padding: "20px", maxWidth: "500px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>
        発送物を追加
      </h1>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <label>名前</label>
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
          <label>画像パス（例：/rewards/sticker.png）</label>
          <input
            type="text"
            value={image}
            onChange={(e) => setImage(e.target.value)}
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
