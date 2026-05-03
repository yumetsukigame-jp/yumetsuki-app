"use client";

import { useState } from "react";
import { db } from "../../../../firebase";
import { doc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function AddRewardForm({ images }) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [cost, setCost] = useState(0);
  const [stock, setStock] = useState(0);
  const [image, setImage] = useState("");

  const handleSave = async (e) => {
    e.preventDefault();

    if (!name || !image) {
      alert("名前と画像を選択してください");
      return;
    }

    const id = name.toLowerCase().replace(/\s+/g, "-");

    await setDoc(doc(db, "rewards", id), {
      name,
      cost,
      stock,
      image, // ← フルパスをそのまま保存
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
                key={img}
                onClick={() => setImage(img)}
                style={{
                  border:
                    image === img
                      ? "3px solid #4f46e5"
                      : "1px solid #ccc",
                  padding: "5px",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                <img
                  src={img} // ← 修正ポイント（フルパスをそのまま使う）
                  alt={img}
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
